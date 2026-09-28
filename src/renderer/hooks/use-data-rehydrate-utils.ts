import type { FileNode, ColumnSchema } from '@shared/types'
import { getLogicalViewName, getSidecarTableName } from '@shared/naming-utils'

interface SQLResultRow {
  table_name?: string
}

interface RunSQLResult {
  success: boolean
  data?: {
    data: SQLResultRow[]
  }
  error?: string
}

interface ReIngestResult {
  success: boolean
  data?: {
    lastModified: number
    newColumns: ColumnSchema[]
  }
  error?: string
}

export interface RehydrateAPI {
  runSQL: (sql: string) => Promise<RunSQLResult>
  deleteTable: (tableName: string) => Promise<unknown>
  reIngestFile: (params: {
    fileId: string
    filePath: string
    tableName: string
    sheetName?: string
    columns?: ColumnSchema[]
    readOptions?: Record<string, unknown>
  }) => Promise<ReIngestResult>
}

export interface RehydrateActions {
  setRestoring: (value: boolean) => void
  reloadFile: (fileId: string, result: { lastModified: number; newColumns: ColumnSchema[] }) => void
  markAsStale: (ids: string[]) => void
  updateFile: (id: string, updates: Partial<FileNode>) => void
  markFileMissing: (id: string) => void
  refreshFileMetadata: (fileId: string) => Promise<void>
  getFiles: () => FileNode[]
}

export function getOrphanTables(files: FileNode[], physicalTables: string[]) {
  const validBaseTables = new Set(files.map(f => f.tableName))
  return physicalTables.filter(tableName => {
    const isKnownBase = validBaseTables.has(tableName)
    const isSidecarOfKnown = Array.from(validBaseTables).some(
      baseTable => tableName === getSidecarTableName(baseTable)
    )
    return !isKnownBase && !isSidecarOfKnown
  })
}

async function tableExists(api: RehydrateAPI, tableName: string) {
  const checkRes = await api.runSQL(
    `SELECT table_name FROM information_schema.tables WHERE table_name = '${tableName}' AND table_schema = 'main'`
  )

  return Boolean(checkRes.success && checkRes.data && checkRes.data.data.length > 0)
}

export async function rehydrateProjectData(
  files: FileNode[],
  api: RehydrateAPI,
  actions: RehydrateActions
) {
  const dbTablesRes = await api.runSQL(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'BASE TABLE'"
  )

  if (dbTablesRes.success && dbTablesRes.data) {
    const physicalTables = dbTablesRes.data.data
      .map(row => row.table_name)
      .filter((name): name is string => Boolean(name))
    const orphans = getOrphanTables(files, physicalTables)

    for (const tableName of orphans) {
      await api.deleteTable(tableName)
      await api.runSQL(`DROP VIEW IF EXISTS "${getLogicalViewName(tableName)}"`)
    }
  }

  const readyFiles = files.filter(f => f.status === 'ready' && f.tableName)
  let isRestoring = false

  for (const file of readyFiles) {
    try {
      const exists = await tableExists(api, file.tableName)
      if (!exists) {
        if (!isRestoring) {
          actions.setRestoring(true)
          isRestoring = true
        }

        if (file.source.type === 'local_file') {
          const result = await api.reIngestFile({
            fileId: file.id,
            filePath: file.source.path,
            tableName: file.tableName,
            sheetName: file.source.subResource,
            columns: file.columns,
            readOptions: file.source.readOptions,
          })

          if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to re-ingest file')
          }

          actions.reloadFile(file.id, result.data)
        } else {
          throw new Error('Database table missing. Manual re-sync required.')
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      if (
        errorMessage.includes('FILE_NOT_FOUND') ||
        errorMessage.includes('ENOENT')
      ) {
        actions.markFileMissing(file.id)
      } else {
        actions.markAsStale([file.id])
        actions.updateFile(file.id, { status: 'error', error: errorMessage })
      }
    }
  }

  const latestFiles = actions.getFiles().filter(f => f.status === 'ready')

  for (const file of latestFiles) {
    try {
      await actions.refreshFileMetadata(file.id)
    } catch (error) {
      console.error(`[Rehydrate] Metadata refresh failed for ${file.tableName}`, error)
    }
  }

  if (isRestoring) {
    actions.setRestoring(false)
  }
}
