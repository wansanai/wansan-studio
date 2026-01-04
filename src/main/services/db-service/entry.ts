import { DuckDBInstance } from '@duckdb/node-api'
import { DBRequest, DBResponse } from '../../../shared/types/ipc-db'
import { sanitizeValue } from '../../../shared/serialization'
import { normalizeDuckDBType } from '../../../shared/type-utils'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// --- Logging Setup ---
const LOG_FILE = path.join(os.tmpdir(), 'wansan-db-worker.log')

function log(msg: string, ...args: any[]) {
  const timestamp = new Date().toISOString()
  const text = `[${timestamp}] ${msg} ${args.length ? JSON.stringify(args, null, 2) : ''}\n`
  try {
    fs.appendFileSync(LOG_FILE, text)
  } catch (e) {
    // ignore
  }
  console.log(msg, ...args)
}

function logError(msg: string, err: any) {
  const timestamp = new Date().toISOString()
  const errorDetails = err instanceof Error ? err.stack : JSON.stringify(err)
  const text = `[${timestamp}] [ERROR] ${msg}\n${errorDetails}\n`
  try {
    fs.appendFileSync(LOG_FILE, text)
  } catch (e) {
    // ignore
  }
  console.error(msg, err)
}

// Global handlers to catch crash-inducing errors
process.on('uncaughtException', (err) => {
  logError('Uncaught Exception', err)
})

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection', reason)
})

log('----------------------------------------')
log('DB Worker Process Started')
log('Environment Info:', {
  cwd: process.cwd(),
  execPath: process.execPath,
  platform: os.platform(),
  arch: os.arch(),
  nodeVersion: process.version,
  pid: process.pid
})

let db: DuckDBInstance | null = null
let connection: any = null
let messageQueue: Promise<void> = Promise.resolve()

async function handleMessage(msg: DBRequest) {
  const { reqId, type, payload } = msg

  // Chain to the queue to ensure sequential processing
  messageQueue = messageQueue.then(async () => {
    try {
      log(`Processing message: ${type}`, { reqId })
      
      switch (type) {
        case 'CONNECT': {
          if (connection) {
            try {
              // In @duckdb/node-api, explicit termination is better
              // Attempt to close if the API supports it, otherwise nullify
              connection = null
              db = null
              log('Closed previous connection')
            } catch (e) {
              logError('Error closing previous connection:', e)
            }
          }

          const dbPath = payload?.path || ':memory:'
          log(`[DB-Worker] Connecting to ${dbPath}...`)
          
          try {
            db = await DuckDBInstance.create(dbPath)
            log('[DB-Worker] DB Instance created')
            
            connection = await db.connect()
            log('[DB-Worker] Connection established')
            
            process.parentPort?.postMessage({
              reqId,
              success: true,
              data: { status: 'Connected', path: dbPath },
            } as DBResponse)
          } catch (connErr) {
            logError('[DB-Worker] Connection Fatal Error', connErr)
            throw connErr
          }
          break
        }

        case 'QUERY': {
          if (!db || !connection) {
            throw new Error(
              'Database not connected. Please call CONNECT first.'
            )
          }

          // log('Running SQL:', payload.sql) // Optional: might be verbose
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

          process.parentPort?.postMessage({
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
          process.parentPort?.postMessage({
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

            process.parentPort?.postMessage({
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

            process.parentPort?.postMessage({
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
          process.parentPort?.postMessage({
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
          log(
            `[DB-Worker] Ingesting ${format} from ${safePath} into ${tableName}...`
          )

          try {
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
            log(`[DB-Worker] Ingestion successful for ${tableName}`)
          } catch (ingestErr) {
            logError(`[DB-Worker] Ingestion failed for ${tableName}`, ingestErr)
            throw ingestErr
          }

          process.parentPort?.postMessage({
            reqId,
            success: true,
          } as DBResponse)
          break
        }

        case 'CLOSE': {
          try {
            connection = null
            db = null
            log('[DB-Worker] Connection closed requested')
          } catch (e) {
            logError('Error during close:', e)
          }
          process.parentPort?.postMessage({
            reqId,
            success: true,
          } as DBResponse)
          break
        }

        case 'TEST':
        case 'TEST_CONNECTION': {
          log('[DB-Worker] TEST_CONNECTION received')
          if (!db || !connection) {
            log('[DB-Worker] Auto-connecting for test...')
            db = await DuckDBInstance.create(':memory:')
            connection = await db.connect()
          }
          const result = await connection.run(
            "SELECT 'Native DuckDB is Alive' as status"
          )
          const rows = await result.getRowObjectsJS()
          process.parentPort?.postMessage({
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
      logError(`[DB-Worker] Error handling ${type}:`, err)
      process.parentPort?.postMessage({
        reqId,
        success: false,
        error: err.message,
      } as DBResponse)
    }
  })
}

if (process.parentPort) {
  process.parentPort.on('message', e => {
    handleMessage(e.data)
  })
  log('[DB-Service] Listening on parentPort')
} else {
  logError('[DB-Service] process.parentPort is undefined!', {})
}

log('[DB-Service] Utility Process Entry Ready')