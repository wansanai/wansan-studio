// import { DuckDBInstance } from '@duckdb/node-api' // Move to deferred require
import { DBRequest, DBResponse } from '../../../shared/types/ipc-db'
import { sanitizeValue } from '../../../shared/serialization'
import { normalizeDuckDBType } from '../../../shared/type-utils'
import fs from 'fs'
import path from 'path'
import os from 'os'
import Module from 'module'

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

// --- DUCKDB LOADER HACK ---
// On Windows, loading the .node file directly from the app.asar.unpacked directory
// often fails with "Access is denied" when running in a child process spawned by Electron.
// We circumvent this by copying the binary to %TEMP% and hijacking the module loader.
function prepareDuckDBEnvironment() {
  if (process.platform !== 'win32') return

  try {
    logToFile('Starting DuckDB Windows loader patch...')
    
    // 1. Find the source .node file
    // The path structure in unpacked directory is predictable
    const baseDir = path.resolve(__dirname, '../../../../node_modules')
    // We need to find where @duckdb/node-bindings is. It might be nested or flattened.
    // Let's try a few common locations.
    const candidates = [
      path.join(baseDir, '@duckdb/node-bindings/node_modules/@duckdb/node-bindings-win32-x64/duckdb.node'),
      path.join(baseDir, '@duckdb/node-bindings-win32-x64/duckdb.node'), // If flattened
      // Development path fallback
      path.join(process.cwd(), 'node_modules/@duckdb/node-bindings/node_modules/@duckdb/node-bindings-win32-x64/duckdb.node')
    ]

    let sourcePath = ''
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        sourcePath = p
        break
      }
    }

    if (!sourcePath) {
      logToFile('Warning: Could not locate duckdb.node for patching. Standard loading will be attempted.')
      return
    }

    logToFile(`Found source binding: ${sourcePath}`)

    // 2. Copy to Temp
    const tempFileName = `duckdb-native-${process.pid}-${Date.now()}.node`
    const tempPath = path.join(os.tmpdir(), tempFileName)
    
    fs.copyFileSync(sourcePath, tempPath)
    logToFile(`Copied binding to: ${tempPath}`)

    // 3. Cleanup on exit
    process.on('exit', () => {
      try { fs.unlinkSync(tempPath) } catch {}
    })

    // 4. Hook Module._resolveFilename
    const originalResolve = (Module as any)._resolveFilename
    ;(Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean) {
      if (request.endsWith('duckdb.node')) {
        logToFile(`Redirecting load request for duckdb.node to ${tempPath}`)
        return tempPath
      }
      return originalResolve.call(this, request, parent, isMain)
    }
    
    logToFile('Loader patch applied successfully.')

  } catch (e: any) {
    logToFile(`Loader patch failed: ${e.message}. Proceeding with standard load.`)
  }
}

prepareDuckDBEnvironment()
// --------------------------

logToFile('==============================================')
logToFile(`DB Worker Starting... PID: ${process.pid}`)
logToFile(`Node Version: ${process.version}`)
logToFile(`CWD: ${process.cwd()}`)

try {
  logToFile('Attempting to check dependencies...')
} catch (e: any) {
  logToFile(`Dependency Check Error: ${e.message}`)
}
// --- DEBUG LOGGER END ---

let DuckDBInstance: any = null
let db: any = null
let connection: any = null
let messageQueue: Promise<void> = Promise.resolve()

/**
 * Lazy load DuckDB to ensure environment is ready
 */
function ensureDuckDBLoaded() {
  if (DuckDBInstance) return
  
  logToFile('Attempting to require @duckdb/node-api...')
  try {
    const module = require('@duckdb/node-api')
    DuckDBInstance = module.DuckDBInstance
    logToFile('Successfully loaded @duckdb/node-api')
  } catch (e: any) {
    logToFile(`CRITICAL: Failed to load @duckdb/node-api: ${e.message}`)
    if (e.stack) logToFile(`Stack: ${e.stack}`)
    throw e
  }
}

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
          ensureDuckDBLoaded()
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

          const dbPath = payload?.path || ':memory:'
          console.log(`[DB-Worker] Connecting to ${dbPath}...`)

          // Switch log path to project directory if not in memory
          if (dbPath !== ':memory:') {
            const projectDir = path.dirname(dbPath)
            currentLogPath = path.join(projectDir, 'wansan-db-worker.log')
            logToFile(`Log switched to project directory: ${currentLogPath}`)
          }

          db = await DuckDBInstance.create(dbPath)
          connection = await db.connect()
          sendToParent({
            reqId,
            success: true,
            data: { status: 'Connected', path: dbPath },
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
          ensureDuckDBLoaded()
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
  // Support for child_process.fork
  process.on('message', (msg: DBRequest) => {
    logToFile(`Received message (child_process): ${msg.type}`)
    handleMessage(msg)
  })
} else {
  logToFile('[Warning] No parentPort or process.on detected!')
}

console.log('[DB-Service] Utility Process Entry Ready')
logToFile('DB Service Ready and Waiting.')
