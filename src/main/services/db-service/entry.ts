import type { DuckDBInstance as DuckDBInstanceType } from '@duckdb/node-api'
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

// Dynamic Loader for Native Module
let DuckDBClass: typeof DuckDBInstanceType | null = null;

async function loadDuckDB() {
  if (DuckDBClass) return DuckDBClass;
  try {
    log('[DB-Worker] Loading @duckdb/node-api...')

    // [Windows Fix] Try to locate the .node file and check its status
    // This helps diagnose if it's a path length issue or permission issue
    // We also set CWD to the parent of the entry script to help DLL resolution
    try {
        const scriptDir = path.dirname(__filename);
        process.chdir(scriptDir);
        log(`[DB-Worker] Changed CWD to: ${scriptDir}`);
    } catch (err) {
        logError('[DB-Worker] Failed to change CWD', err);
    }

    // Use Function to bypass webpack/bundler static analysis if needed,
    // but standard dynamic import() is usually sufficient and safer for types.
    // However, in CJS output, import() returns a Promise resolving to the module.
    const module = await import('@duckdb/node-api');
    DuckDBClass = module.DuckDBInstance;
    log('[DB-Worker] @duckdb/node-api loaded successfully')
    return DuckDBClass;
  } catch (e: any) {
    logError('[DB-Worker] Failed to load @duckdb/node-api', e);

    // [Diagnostic] Check if file exists at the reported path
    if (e.message && e.message.includes('Access is denied') && e.message.includes('\\\\?\\')) {
        const match = e.message.match(/\\\\.*?\.node/);
        if (match) {
            const nodePath = match[0];
            log(`[DB-Worker] Diagnosing path: ${nodePath}`);
            try {
                // Remove \\?\ prefix for fs operations if needed, though Node usually handles it
                const fsPath = nodePath.replace(/^\\\\\?\\/, '');
                if (fs.existsSync(fsPath)) {
                    log('[DB-Worker] File exists on disk.');
                    try {
                        const stats = fs.statSync(fsPath);
                        log('[DB-Worker] File stats:', stats);
                        try {
                           fs.accessSync(fsPath, fs.constants.R_OK | fs.constants.X_OK);
                           log('[DB-Worker] File is readable and executable.');
                        } catch (accessErr) {
                           logError('[DB-Worker] File permission check failed', accessErr);
                        }
                    } catch (statErr) {
                         logError('[DB-Worker] Failed to stat file', statErr);
                    }
                } else {
                    log('[DB-Worker] File DOES NOT exist at path.');
                }
            } catch (diagErr) {
                logError('[DB-Worker] Diagnostic check failed', diagErr);
            }
        }
    }

    throw e;
  }
}

let db: DuckDBInstanceType | null = null
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
            const DuckDB = await loadDuckDB();
            if (!DuckDB) throw new Error('DuckDB Class not loaded');

            db = await DuckDB.create(dbPath)
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
          try {
             // Ensure DB class is loaded
             const DuckDB = await loadDuckDB();
             if (!DuckDB) throw new Error('DuckDB Class not loaded');

             if (!db || !connection) {
              log('[DB-Worker] Auto-connecting for test...')
              db = await DuckDB.create(':memory:')
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
          } catch (testErr) {
             logError('[DB-Worker] TEST_CONNECTION failed', testErr);
             throw testErr;
          }
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
