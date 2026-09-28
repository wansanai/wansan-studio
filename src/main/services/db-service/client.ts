import { app, UtilityProcess, utilityProcess } from 'electron'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { DBRequest, DBResponse } from '../../../shared/types/ipc-db'

export class NativeDBClient {
  private child: UtilityProcess | null = null
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (reason?: unknown) => void
      returnFull?: boolean
    }
  >()
  private initPromise: Promise<void> | null = null
  private isReady = false
  private projectPath: string | null = null

  async init(initialPath: string = ':memory:') {
    // If already ready and path matches, do nothing
    if (this.isReady && this.projectPath === initialPath) {
      return
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      await this.initPromise
      // After waiting, if our desired path still doesn't match the one that was just initialized,
      // and we are requesting a specific file path, we MUST call connect() to switch.
      if (this.projectPath !== initialPath && initialPath !== ':memory:') {
        console.log(
          `[DB-Client] Initialized path '${this.projectPath}' differs from requested '${initialPath}'. Switching...`
        )
        return this.connect(initialPath)
      }
      return
    }

    this.initPromise = (async () => {
      try {
        const entryPath = join(
          app.getAppPath(),
          'dist/main/services/db-service/entry.cjs'
        )

        if (!this.child) {
          console.log(`[DB-Client] Spawning Utility Process...`)
          // Use 'pipe' instead of 'inherit' to avoid EBADF on Windows GUI apps
          this.child = utilityProcess.fork(entryPath, [], {
            serviceName: 'Wansan-DB-Service',
            stdio: 'pipe',
          })

          // Pipe child logs to main process console
          this.child.stdout?.on('data', (data) => {
            const str = data.toString().trim()
            if (str) console.log(`[DB-Service] ${str}`)
          })
          
          this.child.stderr?.on('data', (data) => {
            const str = data.toString().trim()
            if (str) console.error(`[DB-Service Error] ${str}`)
          })

          this.child.on('message', (msg: DBResponse) => {
            const handler = this.pendingRequests.get(msg.reqId)
            if (handler) {
              if (msg.success) {
                if (handler.returnFull) handler.resolve(msg)
                else handler.resolve(msg.data)
              } else {
                handler.reject(new Error(msg.error))
              }
              this.pendingRequests.delete(msg.reqId)
            }
          })

          this.child.on('exit', code => {
            console.error(
              `[DB-Client] Utility Process exited with code: ${code}`
            )
            this.child = null
            this.isReady = false
            this.initPromise = null
            this.projectPath = null
          })
        }

        // Connect DB
        console.log(`[DB-Client] Initializing connection to: ${initialPath}`)
        await this.send('CONNECT', { path: initialPath })
        this.projectPath = initialPath !== ':memory:' ? initialPath : null
        this.isReady = true
        console.log(
          `[DB-Client] Native DB Client is ready. (Path: ${initialPath})`
        )
      } catch (err) {
        console.error(`[DB-Client] Failed to initialize:`, err)
        this.child = null
        this.initPromise = null
        throw err
      }
    })()

    return this.initPromise
  }

  async executeQuery(sql: string) {
    const res = await this.executeQueryFull(sql)
    return res.data
  }

  async executeQueryFull(sql: string): Promise<{ data: Record<string, unknown>[]; meta?: unknown }> {
    await this.init() // Defaults to :memory: if not already running
    const res = await this.sendFull('QUERY', { sql })
    return {
      data: (res.data as Record<string, unknown>[]) || [],
      meta: res.meta,
    }
  }

  private sendFull(type: DBRequest['type'], payload: unknown): Promise<DBResponse> {
    if (!this.child) {
      return Promise.reject(
        new Error('DB Service not initialized. Child process is null.')
      )
    }

    return new Promise<DBResponse>((resolve, reject) => {
      const reqId = uuidv4()
      this.pendingRequests.set(reqId, {
        resolve,
        reject,
        returnFull: true,
      })
      this.child?.postMessage({ reqId, type, payload } as DBRequest)
    })
  }

  private async send(type: DBRequest['type'], payload: unknown): Promise<unknown> {
    const res = await this.sendFull(type, payload)
    return res.data
  }

  async connect(path: string = ':memory:') {
    // If not even forked yet, use init
    if (!this.child) {
      return this.init(path)
    }

    // If init is currently running, wait for it
    if (this.initPromise) {
      await this.initPromise
    }

    // Check if we are already on this path
    const normalizedPath = path === ':memory:' ? null : path
    if (this.projectPath === normalizedPath && this.isReady) {
      return { status: 'Already connected', path }
    }

    console.log(
      `[DB-Client] Switching connection from '${this.projectPath || ':memory:'}' to: ${path}`
    )
    const res = await this.send('CONNECT', { path })
    this.projectPath = path !== ':memory:' ? path : null
    this.isReady = true
    return res
  }

  async getSchema(tableName?: string) {
    await this.init()
    return this.send('GET_SCHEMA', { tableName })
  }

  async deleteTable(tableName: string) {
    await this.init()
    return this.send('DELETE_TABLE', { tableName })
  }

  async ingestFile(
    tableName: string,
    filePath: string,
    format: 'csv' | 'json'
  ) {
    await this.init()
    return this.send('INGEST_FILE', { tableName, filePath, format })
  }

  async checkpoint() {
    await this.init()
    return this.send('CHECKPOINT', {})
  }

  async stop() {
    if (this.child) {
      if (this.isReady) {
        try {
          // Try graceful close first
          await this.sendFull('CLOSE', {})
        } catch (e) {
          console.warn('[NativeDB] Graceful close failed, forcing kill.', e)
        }
      }
      this.child.kill()
      this.child = null
      this.isReady = false
      this.initPromise = null
      this.pendingRequests.clear()
    }
  }
}

export const dbClient = new NativeDBClient()
