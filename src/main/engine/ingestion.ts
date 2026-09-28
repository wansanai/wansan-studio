import { app } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { fork } from 'child_process'
import { NativeDatabaseService } from '../services/native-db-service'
import { TableSchema, ColumnSchema, ColumnType } from '../../shared/types'
import { normalizeDuckDBType } from '../../shared/type-utils'
import { processSampleValue } from '../../shared/serialization'
import { sanitizeTableName } from '../../shared/naming-utils'
import { TempFileManager } from '../utils/temp-manager'

type DBService = NativeDatabaseService

type IngestionProgressInfo = {
  rowCount?: number
  isPercentage?: boolean
  progress?: number
}

interface InspectSheetResult {
  sourceName: string
  previewHeaders?: string[]
}

interface ExcelWorkerSheetResult {
  sheetName: string
  csvFilePath?: string
  error?: string
}

type ExcelWorkerMessage =
  | ({ type: 'progress' } & IngestionProgressInfo)
  | { success: true; data: InspectSheetResult[] | ExcelWorkerSheetResult[] }
  | { success: false; error?: string; stack?: string }

/**
 * Common logic to fetch column schema and sample values after a table is created
 */
async function fetchTableSchema(
  databaseService: DBService,
  tableName: string,
  description: string
): Promise<TableSchema> {
  const columnsResult = await databaseService.query(
    `PRAGMA table_info('${tableName}');`
  )

  const columns: ColumnSchema[] = await Promise.all(
    columnsResult.map(async (col: Record<string, unknown>) => {
      const finalType = normalizeDuckDBType(col.type as string)
      const sampleValues = await getSampleValues(
        databaseService,
        tableName,
        col.name as string,
        finalType
      )

      return {
        name: col.name as string,
        safeName: col.name as string,
        type: finalType,
        sampleValues,
      }
    })
  )

  return {
    tableName,
    description,
    columns,
  }
}

/**
 * Ingests JSON data into a table and returns the schema
 */
export async function ingestJsonData(
  databaseService: DBService,
  tableName: string,
  rows: unknown[]
): Promise<TableSchema> {
  try {
    const jsonContent = JSON.stringify(rows)
    
    // [OPTIMIZATION] Use centralized temp manager
    await TempFileManager.ensureTempDir()
    const tempPath = TempFileManager.getTempFilePath('.json')
    
    await fs.writeFile(tempPath, jsonContent)
    // DuckDB expects forward slashes
    const loadPath = tempPath.replace(/\\/g, '/')

    await databaseService.exec(`DROP TABLE IF EXISTS "${tableName}"`)

    await databaseService.exec(
      `CREATE TABLE "${tableName}" AS
      SELECT *
      FROM read_json_auto('${loadPath}', format = 'auto', auto_detect = true)`
    )

    // [OPTIMIZATION] Free resources
    await TempFileManager.secureUnlink(tempPath)

    return fetchTableSchema(databaseService, tableName, 'Imported JSON Data')
  } catch (error) {
    console.error('JSON ingestion failed', error)
    throw error
  }
}

export async function getSampleValues(
  databaseService: DBService,
  tableName: string,
  columnName: string,
  columnType: ColumnType
): Promise<unknown[]> {
  const rows = await databaseService.query(
    `SELECT DISTINCT "${columnName}"
     FROM "${tableName}"
     WHERE "${columnName}" IS NOT NULL LIMIT 3`
  )

  return rows.map((row: Record<string, unknown>) => {
    const val = row[columnName]
    return processSampleValue(val, columnType)
  })
}

export function ingestExcelFile(
  filePath: string,
  databaseService: DBService,
  fileName: string,
  targetTableName: string | undefined,
  targetSheetName: string | undefined,
  onProgress: ((progressInfo: IngestionProgressInfo) => void) | undefined,
  prefix: string | undefined,
  typesParam: string | undefined,
  limitRows: number | undefined,
  type: 'inspect'
): Promise<InspectSheetResult[]>
export function ingestExcelFile(
  filePath: string,
  databaseService: DBService,
  fileName: string,
  targetTableName?: string,
  targetSheetName?: string,
  onProgress?: (progressInfo: IngestionProgressInfo) => void,
  prefix?: string,
  typesParam?: string,
  limitRows?: number,
  type?: 'convert'
): Promise<TableSchema[]>
export async function ingestExcelFile(
  filePath: string,
  databaseService: DBService,
  fileName: string,
  targetTableName?: string,
  targetSheetName?: string,
  onProgress?: (progressInfo: IngestionProgressInfo) => void,
  prefix: string = 't_',
  typesParam?: string,
  limitRows?: number,
  type: 'inspect' | 'convert' = 'convert' // [NEW]
): Promise<InspectSheetResult[] | TableSchema[]> {
  const workerPath = path.join(
    app.getAppPath(),
    'dist/main/workers/excelWorker.js'
  )

  const tempDir = await TempFileManager.ensureTempDir()

  return new Promise((resolve, reject) => {
    const worker = fork(workerPath, [], { execArgv: [] })

    worker.send({
      type, // [NEW]
      filePath,
      outputDir: tempDir,
      targetSheetName,
      targetTableName,
      prefix,
    })

    worker.on('message', async (message: ExcelWorkerMessage) => {
      if ('type' in message && message.type === 'progress') {
        if (onProgress) onProgress(message)
        return
      }

      if ('success' in message && message.success) {
        if (type === 'inspect') {
          resolve(message.data as InspectSheetResult[])
          return
        }

        const results: TableSchema[] = []
// ... (rest of convert logic remains same)
        const data = message.data as ExcelWorkerSheetResult[]

        try {
          for (const { sheetName, csvFilePath, error } of data) {
            if (error) {
              console.error(`Worker failed for sheet ${sheetName}:`, error)
              continue
            }

            if (!csvFilePath || !(await fs.pathExists(csvFilePath))) {
              console.error(
                `Worker returned invalid CSV path for sheet ${sheetName}`
              )
              continue
            }

            let tableName: string
            // Logic to determine table name
            if (targetTableName && data.length === 1) {
              tableName = targetTableName
              await databaseService.exec(`DROP TABLE IF EXISTS "${tableName}"`)
            } else {
              tableName = await getUniqueTableName(
                databaseService,
                fileName,
                sheetName,
                prefix
              )
            }

            // Ingest directly from filesystem path (DuckDB optimization)

            const safeCsvPath = csvFilePath.replace(/\\/g, '/')

            const loadOptions = typesParam
              ? `${typesParam}, auto_detect=true`
              : `HEADER = TRUE, SAMPLE_SIZE = -1, auto_detect=true`

            const limitClause = limitRows ? ` LIMIT ${limitRows}` : ''

            await databaseService.exec(
              `CREATE TABLE "${tableName}" AS
                                SELECT *
                                FROM read_csv_auto('${safeCsvPath}', ${loadOptions})${limitClause}`
            )

            // [OPTIMIZATION] We DO NOT unlink here anymore.
            // The file path is returned in 'tempFilePath' and will be cleaned up by the caller (FileService)
            // after the entire wizard flow is complete or cancelled.

            // const description = allSheetsCount > 1 ? `${fileName} - ${sheetName}` : fileName

            // Fetch schema for the reloaded CSV to ensure columns are populated
            const columnsResult = await databaseService.query(
              `PRAGMA table_info('${tableName}');`
            )
            const columns: ColumnSchema[] = []
            for (const col of columnsResult as Record<string, unknown>[]) {
              const finalType = normalizeDuckDBType(col.type as string)
              const sampleValues = await getSampleValues(
                databaseService,
                tableName,
                col.name as string,
                finalType
              )
              columns.push({
                name: col.name as string,
                safeName: col.name as string,
                type: finalType as ColumnType,
                sampleValues,
              })
            }

            // Process schema and return
            results.push({
              tableName,
              columns,
              description: `${fileName} - ${sheetName}`,
              tempFilePath: csvFilePath,
              sheetName, // Explicitly pass sheetName
            })
          }
          resolve(results)
        } catch (dbError) {
          reject(dbError)
        }
      } else if ('success' in message && !message.success) {
        const failedMessage = message as Extract<ExcelWorkerMessage, { success: false }>
        const err = new Error(failedMessage.error || 'Unknown Worker Error')
        if (failedMessage.stack) {
           err.stack = failedMessage.stack
        }
        reject(err)
      }
    })

    worker.on('error', err => {
      console.error('[Ingestion] Worker error:', err)
      reject(err)
    })
    worker.on('exit', code => {
      console.log('[Ingestion] Worker exited with code:', code)
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`))
    })
  })
}

export async function getUniqueTableName(
  databaseService: DBService,
  originalName: string,
  sheetName?: string,
  prefix: string = 't_'
): Promise<string> {
  const safeName = sanitizeTableName(originalName, sheetName, prefix)

  let currentName = safeName
  let counter = 1

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await databaseService.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_name = '${currentName}'
         AND table_schema = 'main'`
    )

    if (!exists || exists.length === 0) return currentName
    currentName = `${safeName}_${counter++}`
  }
}
