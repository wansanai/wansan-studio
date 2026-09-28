import path from 'path'
import fs from 'fs-extra'
import { v4 as uuidv4 } from 'uuid'
import { NativeDatabaseService } from './native-db-service'
import { MigrationService } from './migration-service'

import {
  ProjectManifest,
  ProjectLoadResult,
  ProjectSavePayload,
  ProjectSessionState,
  SemanticLayer,
  TableSemantic,
} from '../../shared/types/project-manifest'

type AssetWithSemanticState = ProjectManifest['assets'][number] & {
  description?: string
  smartMetrics?: TableSemantic['smartMetrics']
  relations?: TableSemantic['relations']
}

type ManifestFileState = Partial<ProjectManifest> & {
  meta?: Partial<ProjectManifest['meta']>
}


function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

export class ProjectManager {
  private currentProjectPath: string | null = null
  private nativeDB: NativeDatabaseService
  private pendingSaves: Promise<void>[] = []

  constructor(nativeDB: NativeDatabaseService) {
    this.nativeDB = nativeDB
  }

  /**
   * Waits for all pending save operations to complete.
   * Call this before app quit to prevent data loss.
   */
  async waitForPendingSaves(timeoutMs = 2000): Promise<void> {
    if (this.pendingSaves.length === 0) return

    console.log(`[ProjectManager] Waiting for ${this.pendingSaves.length} pending save(s)...`)
    
    // Create a timeout promise
    const timeout = new Promise<void>(resolve => setTimeout(resolve, timeoutMs))
    
    // Wait for all saves or timeout
    await Promise.race([
      Promise.allSettled(this.pendingSaves),
      timeout
    ])
    
    console.log('[ProjectManager] Pending saves cleared (or timed out).')
  }

  public getCurrentProjectPath(): string | null {
    return this.currentProjectPath
  }

  async createProject(name: string, location: string): Promise<string> {
    const projectId = uuidv4()
    const projectDirName = `${name}.wansan`
    const projectPath = path.join(location, projectDirName)

    // Prevent name collisions
    if (await fs.pathExists(projectPath)) {
      throw new Error(`Project "${name}" already exists in this location.`)
    }

    await fs.ensureDir(projectPath)

    const defaultManifest: ProjectManifest = {
      meta: {
        id: projectId,
        name: name,
        version: '0.5.0',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        engine: 'native',
      },
      assets: [],
      settings: {
        theme: 'light',
      },
    }

    const defaultSemantic: SemanticLayer = {
      tables: {},
      domainRules: []
    }

    const defaultSession: ProjectSessionState = {}

    await this.atomicWriteJSON(path.join(projectPath, 'wansan.json'), defaultManifest)
    await this.atomicWriteJSON(path.join(projectPath, 'semantic.json'), defaultSemantic)
    await this.atomicWriteJSON(path.join(projectPath, 'session.json'), defaultSession)

    return projectPath
  }

  async openProject(projectPath: string): Promise<ProjectLoadResult> {
    // 1. Safety Check: Is a project already open?
    if (this.currentProjectPath) {
      console.log(
        `[ProjectManager] Closing active project '${this.currentProjectPath}' before switching...`
      )
      await this.closeProject()
    }

    const manifestPath = path.join(projectPath, 'wansan.json')
    if (!(await fs.pathExists(manifestPath))) {
      throw new Error(
        `Invalid project bundle: wansan.json not found in ${projectPath}`
      )
    }

    // Locking
    const lockPath = path.join(projectPath, '.lock')
    if (await fs.pathExists(lockPath)) {
      try {
        const pid = parseInt(await fs.readFile(lockPath, 'utf-8'), 10)
        // Check if process is alive
        try {
          process.kill(pid, 0) // This throws if pid doesn't exist
          throw new Error(`Project is already open by process ${pid}`)
        } catch (e: unknown) {
          if (getErrorCode(e) === 'EPERM') {
            throw new Error(
              `Project is locked by process ${pid} (Permission Denied to check)`
            )
          }
          if (getErrorMessage(e).includes('Project is already open')) {
            throw e
          }
          // Process not found, lock is stale. Continue.
          console.warn(
            `[ProjectManager] Found stale lock for PID ${pid}. Taking over.`
          )
        }
      } catch (err: unknown) {
        if (getErrorMessage(err).includes('Project is already open')) throw err
        // Else ignore parse error or other issues
      }
    }

    await fs.writeFile(lockPath, process.pid.toString())
    this.currentProjectPath = projectPath

    // 1. Connect DB First!
    const dbPath = path.join(projectPath, 'source.duckdb')
    await this.nativeDB.initialize(dbPath)

    // [V1.7] Data Structure Migration
    const migration = new MigrationService(this.nativeDB)
    await migration.upgradeToV17()

    // 2. Read Meta Data
    let manifest: ProjectManifest
    try {
      manifest = await this.retryWithBackoff(() => fs.readJSON(manifestPath))
    } catch (e: unknown) {
      // Only repair if file is missing (ENOENT) or explicitly corrupted (SyntaxError)
      // If it's a lock issue (EBUSY, EPERM), we should FAIL, not overwrite.
      if (getErrorCode(e) === 'ENOENT' || e instanceof SyntaxError) {
        console.warn(
          `[ProjectManager] wansan.json is corrupted or empty. Attempting repair...`,
          e
        )
        // Repair strategy: Reconstruct minimal manifest
        manifest = {
          meta: {
            id: uuidv4(),
            name: path.basename(projectPath).replace('.wansan', ''),
            version: '0.5.0',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            engine: 'native',
          },
          assets: [],
          settings: {
            theme: 'light',
          },
        }
        // Write it back immediately to fix the file
        try {
          await this.atomicWriteJSON(manifestPath, manifest)
        } catch (writeErr) {
          console.error('Failed to write repaired wansan.json', writeErr)
        }
      } else {
        throw new Error(`Failed to read wansan.json: ${getErrorMessage(e)}`)
      }
    }

    let semantic: SemanticLayer
    try {
      semantic = await this.retryWithBackoff(() => fs.readJSON(path.join(projectPath, 'semantic.json')))
    } catch (e: unknown) {
      if (getErrorCode(e) === 'ENOENT') {
        console.warn('semantic.json missing, using default')
        semantic = { tables: {}, relations: {}, smartMetrics: {} }
      } else if (e instanceof SyntaxError) {
        console.error('semantic.json corrupted, using default (DATA LOSS RISK)', e)
        semantic = { tables: {}, relations: {}, smartMetrics: {} }
      } else {
        // EBUSY or other system error - DO NOT OVERWRITE
        throw new Error(`Failed to read semantic.json: ${getErrorMessage(e)}`)
      }
    }

    let session: ProjectSessionState
    try {
      session = await this.retryWithBackoff(() => fs.readJSON(path.join(projectPath, 'session.json')))
    } catch (e: unknown) {
      if (getErrorCode(e) === 'ENOENT') {
        console.warn('session.json missing, using default')
        session = {}
      } else if (e instanceof SyntaxError) {
        console.error('session.json corrupted, using default (DATA LOSS RISK)', e)
        session = {}
      } else {
        // EBUSY or other system error - DO NOT OVERWRITE
        throw new Error(`Failed to read session.json: ${getErrorMessage(e)}`)
      }
    }

    // [V1.7] Hydration: Merge Physical (manifest) and Logical (semantic) data
    const hydrated = this.hydrateProject(manifest, semantic)

    return {
      path: projectPath,
      manifest: hydrated.manifest,
      semantic: hydrated.semantic,
      session,
    }
  }

  /**
   * [V1.7] Hydration Layer
   * Merges legacy semantics from wansan.json and various formats from semantic.json 
   * into a unified manifest for the UI.
   */
  private hydrateProject(manifest: ProjectManifest, semantic: SemanticLayer): { manifest: ProjectManifest, semantic: SemanticLayer } {
    const tables: Record<string, TableSemantic> = semantic.tables || {}

    // 1. Migrate legacy flat semantic structures
    if (semantic.relations && Object.keys(semantic.relations).length > 0) {
      Object.entries(semantic.relations).forEach(([fileId, rels]) => {
        if (!tables[fileId]) tables[fileId] = { columns: {}, smartMetrics: [], relations: [] }
        tables[fileId].relations = [...(tables[fileId].relations || []), ...rels]
      })
    }
    if (semantic.smartMetrics && Object.keys(semantic.smartMetrics).length > 0) {
      Object.entries(semantic.smartMetrics).forEach(([fileId, metrics]) => {
        if (!tables[fileId]) tables[fileId] = { columns: {}, smartMetrics: [], relations: [] }
        tables[fileId].smartMetrics = [...(tables[fileId].smartMetrics || []), ...metrics]
      })
    }

    // 2. Attach semantic data to manifest assets for UI convenience
    manifest.assets = manifest.assets.map(asset => {
      const tableSemantic: TableSemantic = tables[asset.id] || { columns: {}, smartMetrics: [], relations: [] }
      
      // Migrate legacy column.semantic from wansan.json if present
      asset.columns = asset.columns.map(col => {
        const existingSemantic = col.semantic
        const centralizedSemantic = tableSemantic.columns[col.name]
        return {
          ...col,
          semantic: centralizedSemantic || existingSemantic
        }
      })

      return {
        ...asset,
        smartMetrics: tableSemantic.smartMetrics,
        relations: tableSemantic.relations,
        description: tableSemantic.description || asset.name
      }
    })

    return { 
      manifest, 
      semantic: { ...semantic, tables } 
    }
  }

  async saveProject(
    projectPath: string,
    data: ProjectSavePayload
  ): Promise<void> {
    // If projectPath is null or empty, use currentProjectPath
    const targetPath = projectPath || this.currentProjectPath
    if (!targetPath) {
      throw new Error('No project path specified for save')
    }

    // Self-healing: Ensure directory exists (user might have deleted it)
    if (!(await fs.pathExists(targetPath))) {
      console.warn(
        `[ProjectManager] Project directory missing at ${targetPath}. Re-creating...`
      )
      await fs.ensureDir(targetPath)
    }

    // Trigger non-blocking checkpoint to flush WAL
    this.nativeDB.checkpoint().catch(err => {
      console.warn('[ProjectManager] Checkpoint failed during save:', err)
    })

    // [V1.7] Dehydration: Separate UI-friendly manifest into Physical and Logical files
    const { physicalManifest, logicalSemantic } = this.dehydrateProject(data)

    const tasks = []
    if (physicalManifest) {
      const manifestPath = path.join(targetPath, 'wansan.json')
      let current = {}
      try {
        current = await this.retryWithBackoff(() => fs.readJSON(manifestPath))
      } catch (e: unknown) {
        if (getErrorCode(e) !== 'ENOENT') {
           console.error(`[ProjectManager] Read failed for manifest during save (Code: ${getErrorCode(e)}). Aborting save to prevent data loss.`)
           throw e
        }
      }
      
      const newMeta = {
        ...(current as ManifestFileState).meta,
        ...(physicalManifest.meta || {}),
        updatedAt: Date.now(),
      }

      const updated = {
        ...current,
        ...physicalManifest,
        meta: newMeta,
      }
      tasks.push(this.atomicWriteJSON(manifestPath, updated))
    }

    if (logicalSemantic) {
      const semanticPath = path.join(targetPath, 'semantic.json')
      let current = { tables: {}, domainRules: [] }
      try {
        current = await this.retryWithBackoff(() => fs.readJSON(semanticPath))
      } catch (e: unknown) {
        if (getErrorCode(e) !== 'ENOENT') {
           console.error(`[ProjectManager] Read failed for semantic during save (Code: ${getErrorCode(e)}). Aborting save to prevent data loss.`)
           throw e
        }
      }
      // Merge updates into tables
      const updatedTables = {
        ...(current.tables || {}),
        ...(logicalSemantic.tables || {})
      }
      const updated = { 
        ...current, 
        ...logicalSemantic, 
        tables: updatedTables,
        // Remove legacy fields if they exist
        relations: undefined,
        smartMetrics: undefined
      }
      tasks.push(this.atomicWriteJSON(semanticPath, updated))
    }

    if (data.session) {
      const sessionPath = path.join(targetPath, 'session.json')
      tasks.push(this.atomicWriteJSON(sessionPath, data.session))
    }

    const savePromise = Promise.all(tasks).then(() => {
        // Remove self from pending list when done
        const idx = this.pendingSaves.indexOf(savePromise)
        if (idx !== -1) this.pendingSaves.splice(idx, 1)
    })

    this.pendingSaves.push(savePromise)
    await savePromise
  }

  /**
   * [V1.7] Dehydration Layer
   * Strips semantic data from the UI-facing manifest before saving to physical storage.
   */
  private dehydrateProject(data: ProjectSavePayload): { physicalManifest?: Partial<ProjectManifest>, logicalSemantic?: Partial<SemanticLayer> } {
    if (!data.manifest) return { physicalManifest: data.manifest, logicalSemantic: data.semantic }

    const tables: Record<string, TableSemantic> = {}
    
    // Process assets to extract semantics
    const cleanAssets = data.manifest.assets?.map(asset => {
      const semanticAsset = asset as AssetWithSemanticState
      // Extract to semantic layer
      tables[asset.id] = {
        description: semanticAsset.description,
        smartMetrics: semanticAsset.smartMetrics || [],
        relations: semanticAsset.relations || [],
        columns: {}
      }

      // Extract column-level semantics
      const cleanColumns = asset.columns.map(col => {
        if (col.semantic) {
          tables[asset.id].columns[col.name] = col.semantic
        }
        // Remove semantic from physical manifest
        const { semantic: _semantic, ...physicalCol } = col
        return physicalCol
      })

      return {
        ...asset,
        columns: cleanColumns,
        // Remove logical fields from physical asset
        smartMetrics: undefined,
        relations: undefined,
        description: undefined
      }
    })

    return {
      physicalManifest: {
        ...data.manifest,
        assets: cleanAssets
      },
      logicalSemantic: {
        ...data.semantic,
        tables
      }
    }
  }

  /**
   * Safe atomic write: Write to unique .tmp then rename.
   * Prevents empty files if write fails or process crashes.
   * Using unique tmp name prevents race conditions between concurrent saves of the same file.
   */
  private async atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
    const tmpPath = `${filePath}.${uuidv4().slice(0, 8)}.tmp`
    try {
      await fs.writeJSON(tmpPath, data, { spaces: 2 })
      // fs.rename is atomic on most systems (POSIX and Windows within same drive)
      await fs.rename(tmpPath, filePath)
    } catch (error) {
      console.error(`[ProjectManager] Atomic write failed for ${filePath}`, error)
      // Try to clean up tmp file if it exists
      try {
        if (await fs.pathExists(tmpPath)) {
          await fs.remove(tmpPath)
        }
      } catch (cleanupError) {
        console.warn(`[ProjectManager] Failed to cleanup tmp file ${tmpPath}`, cleanupError)
      }
      throw error
    }
  }

  async closeProject(): Promise<void> {
    if (this.currentProjectPath) {
      const lockPath = path.join(this.currentProjectPath, '.lock')
      try {
        await fs.remove(lockPath)
      } catch (e) {
        console.error('Failed to remove lock file', e)
      }
      this.currentProjectPath = null
    }
    await this.nativeDB.close()
  }

  /**
   * Helper: Retries an async operation with exponential backoff.
   * Useful for overcoming transient file locks (OneDrive, Anti-virus).
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    retries = 3,
    delay = 100
  ): Promise<T> {
    try {
      return await operation()
    } catch (err: unknown) {
      const errorCode = getErrorCode(err)
      if (retries > 0 && (errorCode === 'EBUSY' || errorCode === 'EPERM' || errorCode === 'EACCES')) {
        console.warn(`[ProjectManager] Transient error ${errorCode}, retrying in ${delay}ms... (${retries} left)`)
        await new Promise(resolve => setTimeout(resolve, delay))
        return this.retryWithBackoff(operation, retries - 1, delay * 2)
      }
      throw err
    }
  }
}
