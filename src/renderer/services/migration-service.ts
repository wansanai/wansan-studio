import { projectService } from './project-service'
import { useProjectStore } from '../stores/useProjectStore'
import { useMigrationStore } from '../stores/useMigrationStore'
import { ProjectManifest, SemanticLayer } from '@shared/types/project-manifest'
import { SmartMetric, SyncStatus, TableRelation } from '@shared/types'
import i18n from '../i18n'

export async function performMigration(name: string, location: string) {
  const STORAGE_KEYS = ['wansan-project-v2-legacy-mock', 'wansan-project-v2']
  const { updateProgress, setError, completeMigration } =
    useMigrationStore.getState()

  let legacyRaw: string | null = null
  for (const key of STORAGE_KEYS) {
    legacyRaw = localStorage.getItem(key)
    if (legacyRaw) {
      console.log(`[Migration] Reading legacy data from ${key}`)
      break
    }
  }

  if (!legacyRaw) return

  try {
    const legacyState = JSON.parse(legacyRaw)
    // Zustand persist wraps data in { state: ... }. Handle both.
    const state = legacyState.state || legacyState

    if (!state || !state.files)
      throw new Error(i18n.t('project:error_no_legacy_data'))

    // 1. Initialize Project Bundle
    const projectPath = await projectService.create(name, location)

    // IMPORTANT: Open it immediately to switch the DB connection to the new bundle
    await projectService.open(projectPath)

    // Prepare Relations Map
    const relationsMap: Record<string, TableRelation[]> = {}
    const legacyRelations = state.relations || []
    console.log('[Migration] Legacy relations found:', legacyRelations)

    if (Array.isArray(legacyRelations)) {
      legacyRelations.forEach((rel: any) => {
        // Handle potential different naming in legacy data
        const sourceId = rel.fileAId || rel.sourceFileId
        const targetId = rel.fileBId || rel.targetFileId
        const sourceCol = rel.columnA || rel.sourceColumn
        const targetCol = rel.columnB || rel.targetColumn

        if (sourceId && targetId && sourceCol && targetCol) {
          if (!relationsMap[sourceId]) {
            relationsMap[sourceId] = []
          }
          const newRel = {
            id: rel.id || crypto.randomUUID(),
            targetFileId: targetId,
            sourceColumn: sourceCol,
            targetColumn: targetCol,
            joinType: rel.joinType || 'LEFT',
            autoDetected: rel.autoDetected || false,
          }
          relationsMap[sourceId].push(newRel)
          console.log(
            `[Migration] Mapped relation for file ${sourceId}:`,
            newRel
          )
        } else {
          console.warn('[Migration] Skipping malformed legacy relation:', rel)
        }
      })
    }

    // 2. Re-ingest files into the new Native DuckDB
    const filesToMigrate = [...state.files]
    for (let i = 0; i < filesToMigrate.length; i++) {
      const file = filesToMigrate[i]
      updateProgress(i + 1, i18n.t('project:ingesting', { name: file.name }))

      // Attach relations to the file object early
      file.relations = relationsMap[file.id] || []
      console.log(
        `[Migration] File ${file.name} (ID: ${file.id}) assigned ${file.relations.length} relations`
      )

      try {
        const res = await window.electronAPI.reIngestFile({
          fileId: file.id,
          filePath: file.path,
          tableName: file.tableName,
          sheetName: file.sheetName,
          columns: file.columns, // Pass existing schema to enforce types
        })
        if (!res.success) {
          console.error(`Migration error for ${file.name}:`, res.error)
          filesToMigrate[i] = {
            ...file,
            status: 'error' as SyncStatus,
            error: res.error,
          }
        } else {
          console.log(`[Migration] Re-ingest success for ${file.name}`)
          
          // Merge new columns with old metadata to preserve aliases/customization
          const mergedColumns = res.data.newColumns.map(newCol => {
            const oldCol = file.columns.find(c => c.name === newCol.name || c.safeName === newCol.safeName)
            if (oldCol) {
              return {
                ...newCol,
                alias: oldCol.alias,
                userType: oldCol.userType,
                isKey: oldCol.isKey,
                isPrimaryKey: oldCol.isPrimaryKey,
                nullable: oldCol.nullable
              }
            }
            return newCol
          })

          filesToMigrate[i] = {
            ...file,
            status: 'ready' as SyncStatus,
            columns: mergedColumns,
          }
        }
      } catch (e) {
        console.error(`Migration crash for ${file.name}:`, e)
        filesToMigrate[i] = { ...file, status: 'error' as SyncStatus }
      }
    }

    // 3. Data Transformation
    const smartMetrics: Record<string, SmartMetric[]> = {}
    const finalRelationsMap: Record<string, TableRelation[]> = {}

    filesToMigrate.forEach(f => {
      if (f.smartMetrics && f.smartMetrics.length > 0) {
        smartMetrics[f.id] = f.smartMetrics
      }
      if (f.relations && f.relations.length > 0) {
        finalRelationsMap[f.id] = f.relations
      }
    })

    console.log(
      '[Migration] Final Relations Map for Semantic Layer:',
      finalRelationsMap
    )

    const assets = filesToMigrate.map(f => ({
      id: f.id,
      name: f.name,
      originalPath: f.path,
      tableName: f.tableName,
      columns: f.columns.map(c => ({
        name: c.name,
        type: c.type,
        safeName: c.safeName,
      })),
    }))

    const manifest: Partial<ProjectManifest> = {
      assets,
      settings: { theme: 'light' },
    }

    const semantic: SemanticLayer = {
      tables: {},
      relations: finalRelationsMap,
      smartMetrics,
    }

    const session = {
      sessions: state.sessions || [],
      activeSessionId: state.activeSessionId,
      activeView: state.activeView,
      activeFileId: state.activeFileId,
      widgetRegistry: state.widgetRegistry || {},
    }

    // 4. Persist the final state
    await projectService.save(projectPath, { manifest, semantic, session })

    // 5. Update Runtime Store
    // Ensure we delete any legacy top-level relations to prevent confusion
    const { relations: _oldRel, ...stateWithoutRelations } = state

    useProjectStore.getState().loadProject({
      ...stateWithoutRelations,
      files: filesToMigrate,
    })
    useProjectStore.getState().setProjectPath(projectPath)

    // 6. Mark as complete
    localStorage.removeItem('wansan-project-v2-legacy-mock')
    completeMigration()
  } catch (error: any) {
    console.error('Migration critical failure:', error)
    setError(error.message || i18n.t('project:error_migration_failed'))
  }
}
