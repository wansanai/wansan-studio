import { DuckDBInstance } from '@duckdb/node-api'
import { DBRequest, DBResponse } from '../../../shared/types/ipc-db'
import { sanitizeValue } from '../../../shared/serialization'
import { normalizeDuckDBType } from '../../../shared/type-utils'
import fs from 'fs'
import path from 'path'
import os from 'os'

// --- DEBUG LOGGER START ---
let currentLogPath = path.join(os.tmpdir(), 'wansan-db-worker.log')

function logToFile(msg: string) {
  try {
    const time = new Date().toISOString()
    fs.appendFileSync(currentLogPath, `[${time}] ${msg}\n`)
  } catch (e) {
    // ignore
  }
}

logToFile('==============================================')
logToFile(`DB Worker Starting... PID: ${process.pid}`)
logToFile(`Node Version: ${process.version}`)
logToFile(`CWD: ${process.cwd()}`)

try {
  logToFile('Attempting to check dependencies...')
  // Optional: check if native module can be resolved
  // logToFile(`DuckDB Module Path: ${require.resolve('@duckdb/node-api')}`)
} catch (e: any) {
  logToFile(`Dependency Check Error: ${e.message}`)
}
// --- DEBUG LOGGER END ---

let db: DuckDBInstance | null = null
let connection: any = null
let messageQueue: Promise<void> = Promise.resolve()

// --- IPC ABSTRACTION ---
function sendToParent(msg: DBResponse) {
  if (process.parentPort) {
    process.parentPort.postMessage(msg)
  } else if (process.send) {
    process.send(msg)
  }
}

async function handleMessage(msg: DBRequest) {
  const { reqId, type, payload } = msg

  // Chain to the queue to ensure sequential processing
  messageQueue = messageQueue.then(async () => {
    try {
      switch (type) {
        case 'CONNECT': {
          if (connection) {
            try {
              // In @duckdb/node-api, explicit termination is better
              // Attempt to close if the API supports it, otherwise nullify
              connection = null
              db = null
            } catch (e) {
              console.warn('Error closing previous connection:', e)
            }
          }

          const path = payload?.path || ':memory:'
          console.log(`[DB-Worker] Connecting to ${path}...`)

          // Switch log path to project directory if not in memory
          if (path !== ':memory:') {
            const projectDir = path.dirname(path)
            currentLogPath = path.join(projectDir, 'wansan-db-worker.log')
            logToFile(`Log switched to project directory: ${currentLogPath}`)
          }

          db = await DuckDBInstance.create(path)
          connection = await db.connect()
          sendToParent({
            reqId,
            success: true,
            data: { status: 'Connected', path },
          } as DBResponse)
          break
        }

        case 'QUERY': {
          if (!db || !connection) {
            throw new Error(
              'Database not connected. Please call CONNECT first.'
            )
          }

          const result = await connection.run(payload.sql)
          const rows = await result.getRowObjectsJS()

          // Extract column metadata
          const columnNames = result.columnNames()
          const columnFields = columnNames.map((name: string, i: number) => ({
            name,
            type: normalizeDuckDBType(result.columnType(i).toString()),
          }))

          // CRITICAL: Convert BigInts for JSON serialization
          const serializedRows = sanitizeValue(rows)

          sendToParent({
            reqId,
            success: true,
            data: serializedRows,
            meta: { columnFields },
          } as DBResponse)
          break
        }

        case 'CHECKPOINT': {
          if (!db || !connection) throw new Error('Not connected')
          await connection.run('CHECKPOINT')
          sendToParent({
            reqId,
            success: true,
          } as DBResponse)
          break
        }

        case 'GET_SCHEMA': {
          if (!db || !connection) throw new Error('Not connected')
          const tableName = payload?.tableName

          if (tableName) {
            const result = await connection.run(`
                  SELECT column_name as name, data_type as type, is_nullable as nullable
                  FROM information_schema.columns
                  WHERE table_name = '${tableName}'
                  ORDER BY ordinal_position
              `)
            const rawColumns = await result.getRowObjectsJS()
            // Apply normalization to schema columns
            const columns = rawColumns.map((col: any) => ({
              ...col,
              type: normalizeDuckDBType(col.type),
            }))

            sendToParent({
              reqId,
              success: true,
              data: { tableName, columns },
            } as DBResponse)
          } else {
            const tablesResult = await connection.run(
              "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
            )
            const tables = await tablesResult.getRowObjectsJS()

            const tablesWithDetails = await Promise.all(
              tables.map(async (row: any) => {
                const tName = row.table_name
                const colsResult = await connection.run(`
                      SELECT column_name as name, data_type as type, is_nullable as nullable
                      FROM information_schema.columns
                      WHERE table_name = '${tName}'
                      ORDER BY ordinal_position
                  `)
                const rawCols = await colsResult.getRowObjectsJS()
                const columns = rawCols.map((col: any) => ({
                  ...col,
                  type: normalizeDuckDBType(col.type),
                }))
                return { tableName: tName, columns, description: '' }
              })
            )

            sendToParent({
              reqId,
              success: true,
              data: { tables: tablesWithDetails },
            } as DBResponse)
          }
          break
        }

        case 'DELETE_TABLE': {
          if (!db || !connection) throw new Error('Not connected')
          const tableName = payload.tableName
          // Apply project rule: v_ prefix indicates a VIEW (e.g. for Smart Metrics)
          const isView = tableName.startsWith('v_')
          const dropCmd = isView ? 'DROP VIEW' : 'DROP TABLE'

          await connection.run(`${dropCmd} IF EXISTS "${tableName}"`)
          sendToParent({
            reqId,
            success: true,
          } as DBResponse)
          break
        }

        case 'INGEST_FILE': {
          if (!db || !connection) throw new Error('Not connected')
          const { tableName, filePath, format } = payload

          // Ensure path uses forward slashes for DuckDB
          const safePath = filePath.replace(/\\/g, '/')
          console.log(
            `[DB-Worker] Ingesting ${format} from ${safePath} into ${tableName}...`
          )

          if (format === 'csv') {
            await connection.run(`
                  CREATE TABLE "${tableName}" AS 
                  SELECT * FROM read_csv_auto('${safePath}', HEADER=TRUE, auto_detect=true)
              `)
          } else if (format === 'json') {
            await connection.run(`
                  CREATE TABLE "${tableName}" AS 
                  SELECT * FROM read_json_auto('${safePath}', format='auto', auto_detect=true)
              `)
          } else {
            throw new Error(`Unsupported ingestion format: ${format}`)
          }

          sendToParent({
            reqId,
            success: true,
          } as DBResponse)
          break
        }

        case 'CLOSE': {
          try {
            connection = null
            db = null
          } catch (e) {
            console.error('Error during close:', e)
          }
          sendToParent({
            reqId,
            success: true,
          } as DBResponse)
          break
        }

        case 'TEST':
        case 'TEST_CONNECTION': {
          if (!db || !connection) {
            db = await DuckDBInstance.create(':memory:')
            connection = await db.connect()
          }
          const result = await connection.run(
            "SELECT 'Native DuckDB is Alive' as status"
          )
          const rows = await result.getRowObjectsJS()
          sendToParent({
            reqId,
            success: true,
            data: rows[0],
          } as DBResponse)
          break
        }

        default:
          throw new Error(`Unsupported request type: ${type}`)
      }
    } catch (err: any) {
      logToFile(`[Error] ${type}: ${err.message}\nStack: ${err.stack}`)
      console.error(`[DB-Worker] Error handling ${type}:`, err)
      sendToParent({
        reqId,
        success: false,
        error: err.message,
      } as DBResponse)
    }
  })
}

if (process.parentPort) {
  process.parentPort.on('message', e => {
    logToFile(`Received message: ${e.data.type}`)
    handleMessage(e.data)
  })
} else if (process.on) {
  process.on('message', (msg: DBRequest) => {
    logToFile(`Received message (child_process): ${msg.type}`)
    handleMessage(msg)
  })
} else {
  logToFile('[Warning] No parentPort or process.on detected!')
}

console.log('[DB-Service] Utility Process Entry Ready')
logToFile('DB Service Ready and Waiting.')
