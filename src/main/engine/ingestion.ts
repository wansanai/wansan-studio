import { app } from 'electron'
import * as path from 'path'
import { Worker } from 'worker_threads'
import { DatabaseService } from '../database/duckdb'
import { ColumnSchema, ColumnType, TableSchema } from '../../shared/types'
import { processSampleValue } from '../../shared/serialization'
import { normalizeDuckDBType } from '../../shared/type-utils'

/**
 * Common logic to fetch column schema and sample values after a table is created
 */
async function fetchTableSchema(
  databaseService: DatabaseService,
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
 * 摄取 JSON 数据到 DuckDB（用于 Demo 数据）
 */
export async function ingestJsonData(
  databaseService: DatabaseService,
  tableName: string,
  rows: any[]
): Promise<TableSchema> {
  if (!rows || rows.length === 0) {
    throw new Error('No data provided')
  }

  const tempFileName = `${tableName}.json`

  try {
    // [FIX] Pre-process rows to convert Date objects to wall-time strings
    // to prevent timezone shifts during JSON.stringify (UTC conversion)
    const processedRows = rows.map(row => {
      const newRow: any = {}
      for (const [key, val] of Object.entries(row)) {
        if (val instanceof Date && !isNaN(val.getTime())) {
          // Use LOCAL components to get "Wall Time" literal values
          const year = val.getFullYear()
          const month = String(val.getMonth() + 1).padStart(2, '0')
          const day = String(val.getDate()).padStart(2, '0')
          const hours = val.getHours()
          const minutes = val.getMinutes()
          const seconds = val.getSeconds()
          const ms = val.getMilliseconds()

          // Smart formatting & Snap-to-Midnight (Sync with excelUtils)
          const secondsInDay = hours * 3600 + minutes * 60 + seconds
          const TOLERANCE = 60

          if (secondsInDay < TOLERANCE) {
            newRow[key] = `${year}-${month}-${day}`
          } else if (86400 - secondsInDay < TOLERANCE) {
            const nextDay = new Date(year, parseInt(month) - 1, Number(day) + 1)
            const ndYear = nextDay.getFullYear()
            const ndMonth = String(nextDay.getMonth() + 1).padStart(2, '0')
            const ndDay = String(nextDay.getDate()).padStart(2, '0')
            newRow[key] = `${ndYear}-${ndMonth}-${ndDay}`
          } else {
            const h = String(hours).padStart(2, '0')
            const min = String(minutes).padStart(2, '0')
            const s = String(seconds).padStart(2, '0')
            const msec = String(ms).padStart(3, '0')
            newRow[key] = `${year}-${month}-${day}T${h}:${min}:${s}.${msec}`
          }
        } else {
          newRow[key] = val
        }
      }
      return newRow
    })

    const jsonContent = JSON.stringify(processedRows)

    await databaseService.registerFileText(tempFileName, jsonContent)

    await databaseService.exec(`DROP TABLE IF EXISTS "${tableName}"`)

    await databaseService.exec(
      `CREATE TABLE "${tableName}" AS
      SELECT *
      FROM read_json_auto('${tempFileName}', format = 'auto', auto_detect = true)`
    )

    return fetchTableSchema(databaseService, tableName, 'Imported JSON Data')
  } finally {
  }
}

export async function getSampleValues(
  databaseService: DatabaseService,
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
  fileBuffer: Buffer,
  databaseService: DatabaseService,
  fileName: string,
  targetTableName?: string,
  targetSheetName?: string
): Promise<TableSchema[]> {
  // Resolve worker path
  let workerPath: string
  if (app.isPackaged) {
    // In production, app.asar is where the code lives.
    // We assume the worker file is bundled and present in dist.
    workerPath = path.join(
      process.resourcesPath,
      'app.asar/dist/main/workers/excelWorker.cjs'
    )
  } else {
    // In development
    workerPath = path.join(
      app.getAppPath(),
      'dist/main/workers/excelWorker.cjs'
    )
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { fileBuffer, targetSheetName, targetTableName },
    })

    worker.on('message', async message => {
      if (message.success) {
        const results: TableSchema[] = []
        const { data, allSheetsCount } = message

        try {
          for (const { sheetName, csvData, error } of data) {
            if (error) {
              console.error(`Worker failed for sheet ${sheetName}:`, error)
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
                sheetName
              )
            }

            const tempFileName = `${tableName}.csv`
            await databaseService.registerFileText(tempFileName, csvData)

            await databaseService.exec(
              `CREATE TABLE "${tableName}" AS
                    SELECT *
                    FROM read_csv_auto('${tempFileName}', HEADER = TRUE, SAMPLE_SIZE = -1, auto_detect = true)`
            )

            const description =
              allSheetsCount > 1 ? `${fileName} - ${sheetName}` : fileName

            const schema = await fetchTableSchema(
              databaseService,
              tableName,
              description
            )
            results.push(schema)
          }
          resolve(results)
        } catch (dbError) {
          reject(dbError)
        }
      } else {
        reject(new Error(message.error))
      }
    })

    worker.on('error', reject)
    worker.on('exit', code => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`))
    })
  })
}

export async function getUniqueTableName(
  databaseService: DatabaseService,
  originalName: string,
  sheetName?: string
): Promise<string> {
  let baseName = path.parse(originalName).name

  if (sheetName) {
    baseName = `${baseName}_${sheetName}`
  }

  // Allow Chinese, alphanum, underscore. Replace others with _
  let safeName = 't_' + baseName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
  // Trim underscores
  safeName = safeName.replace(/_+/g, '_').replace(/_$/, '')

  let currentName = safeName
  let counter = 1

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
