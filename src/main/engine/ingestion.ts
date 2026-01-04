import { app } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { fork } from 'child_process'
import { isDev } from '../utils/env'
import { NativeDatabaseService } from '../services/native-db-service'
import { TableSchema, ColumnSchema, ColumnType } from '../../shared/types'
import { normalizeDuckDBType } from '../../shared/type-utils'
import { processSampleValue } from '../../shared/serialization'
import { sanitizeTableName } from '../../shared/naming-utils'
import { TempFileManager } from '../utils/temp-manager'

type DBService = NativeDatabaseService

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
    columnsResult.map(async (col: any) => {
      const finalType = normalizeDuckDBType(col.type)
      const sampleValues = await getSampleValues(
        databaseService,
        tableName,
        col.name,
        finalType
      )

      return {
        name: col.name,
        safeName: col.name,
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
  rows: any[]
): Promise<TableSchema> {
  try {
    const jsonContent = JSON.stringify(rows)
    const tempFileName = `temp_${Date.now()}.json`
    const tempPath = path.join(app.getPath('temp'), tempFileName)
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
    const cleanupPath = path.join(app.getPath('temp'), tempFileName)
    await fs.unlink(cleanupPath).catch(() => {})

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
): Promise<any[]> {
  const rows = await databaseService.query(
    `SELECT DISTINCT "${columnName}"
     FROM "${tableName}"
     WHERE "${columnName}" IS NOT NULL LIMIT 3`
  )

  return rows.map((row: any) => {
    const val = row[columnName]
    return processSampleValue(val, columnType)
  })
}

export async function ingestExcelFile(
  filePath: string,
  databaseService: DBService,
  fileName: string,
  targetTableName?: string,
  targetSheetName?: string,
  onProgress?: (progressInfo: {
    rowCount?: number
    isPercentage?: boolean
    progress?: number
  }) => void,
  prefix: string = 't_',
  typesParam?: string,
  limitRows?: number
): Promise<TableSchema[]> {
  // Resolve worker path reliably using app.getAppPath()
  // This works for both Dev (root/dist/...) and Prod (app.asar/dist/...)
  const workerPath = path.join(
    app.getAppPath(),
    'dist/main/workers/excelWorker.js'
  )

  // Use a dedicated subdirectory for temp files
  const tempDir = await TempFileManager.ensureTempDir()
  console.log('[Ingestion] Using temp dir:', tempDir)

  return new Promise((resolve, reject) => {
    console.log('[Ingestion] Forking worker at:', workerPath)
    const worker = fork(workerPath, [], {
      execArgv: [], // No special args needed
    })

    console.log('[Ingestion] Sending payload to worker...')
    worker.send({
      filePath,
      outputDir: tempDir,
      targetSheetName,
      targetTableName,
      prefix,
    })

    worker.on('message', async (message: any) => {
      console.log('[Ingestion] Received message type:', message.type)
      if (message.type === 'progress') {
        if (onProgress) {
          onProgress({
            rowCount: message.rowCount,
            isPercentage: message.isPercentage,
            progress: message.progress,
          })
        }
        return
      }

      if (message.success) {
        console.log(
          '[Ingestion] Worker reported success. Processing results...'
        )
        const results: TableSchema[] = []
        const { data } = message

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
            for (const col of columnsResult) {
              const finalType = normalizeDuckDBType(col.type)
              const sampleValues = await getSampleValues(
                databaseService,
                tableName,
                col.name,
                finalType
              )
              columns.push({
                name: col.name,
                safeName: col.name,
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
      } else {
        reject(new Error(message.error))
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
