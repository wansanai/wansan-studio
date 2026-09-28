import { DBConnectionConfig } from '@shared/types'
import { NativeDatabaseService } from './native-db-service'
import { secureGet } from './secure-storage'
import { normalizeDuckDBType } from '@shared/type-utils'
import fs from 'fs-extra'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'
import type { TransformCallback } from 'stream'
import { TempFileManager } from '../utils/temp-manager'

export interface DBTableInfo {
  name: string
  schema?: string
}

type RowRecord = Record<string, unknown>

interface PreviewColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey?: boolean
  description?: string
}

interface PreviewTableResult {
  columns: PreviewColumn[]
  preview: RowRecord[]
  rowCount: number
}

interface MysqlShowColumnRow {
  Field: string
  Type: string
  Null: string
  Key: string
  Comment?: string
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

/**
 * Helper to correctly quote table names.
 * Postgres: "schema"."table" or "table"
 * MySQL: `table`
 */
function escapeTableName(fullTableName: string, type: 'postgres' | 'mysql'): string {
  if (type === 'postgres') {
    if (fullTableName.includes('.')) {
      const parts = fullTableName.split('.')
      return `"${parts[0]}"."${parts[1]}"`
    }
    return `"${fullTableName}"`
  } else {
    return `\`${fullTableName}\``
  }
}

function parseTableId(fullId: string): { schema?: string; table: string } {
  if (fullId.includes('.')) {
    const [schema, table] = fullId.split('.')
    return { schema, table }
  }
  return { table: fullId }
}

/**
 * 高性能 CSV 格式化器，支持流式处理
 * 确保大数据量下内存占用极低，且正确处理 CSV 转义
 */
class CSVFormatter extends Transform {
  private isFirstChunk = true
  constructor(private columns: string[]) {
    super({ objectMode: true })
  }

  _transform(row: RowRecord, _encoding: string, callback: TransformCallback) {
    let result = ''
    if (this.isFirstChunk) {
      // 写入 CSV 表头
      result += this.columns.map(c => `"${c.replace(/"/g, '""')}"`).join(',') + '\n'
      this.isFirstChunk = false
    }

    // 写入行数据
    result += this.columns.map(col => {
      const val = row[col]
      if (val === null || val === undefined) return ''
      if (val instanceof Date) return val.toISOString()
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
      
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(',') + '\n'

    callback(null, result)
  }
}

function parseExtraParams(paramsStr?: string): Record<string, string> {
  const params: Record<string, string> = {}
  if (!paramsStr) return params
  
  const pairs = paramsStr.split('&')
  for (const pair of pairs) {
    const [key, value] = pair.split('=')
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || '')
    }
  }
  return params
}

export class DBConnectorService {
  constructor(private databaseService: NativeDatabaseService) {}

  /**
   * 测试数据库连接
   */
  async testConnection(config: DBConnectionConfig, passwordOverride?: string): Promise<boolean> {
    const password = passwordOverride || secureGet(`db_pass_${config.id}`) || ''
    const extra = parseExtraParams(config.params)
    
    if (config.type === 'postgres') {
      const { Client } = await import('pg')
      const client = new Client({
        host: config.host,
        port: config.port,
        user: config.user,
        password: password,
        database: config.database,
        connectionTimeoutMillis: 5000,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        ...extra
      })
      try {
        await client.connect()
        await client.end()
        return true
      } catch (e: unknown) {
        console.error('[Connector] PG Connection failed:', e)
        if (getErrorMessage(e).includes('received invalid response: 4a')) {
          console.error('[Connector] Hint: You might be connecting to a non-Postgres service, or there is an SSL mismatch (try enabling/disabling SSL).')
        }
        throw e
      }
    } else {
      const mysql = await import('mysql2/promise')
      try {
        const connection = await mysql.createConnection({
          host: config.host,
          port: config.port,
          user: config.user,
          password: password,
          database: config.database,
          connectTimeout: 5000,
          charset: 'UTF8MB4',
          ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
          ...extra
        })
        await connection.query("SET NAMES 'utf8mb4'")
        await connection.end()
        return true
      } catch (e: unknown) {
        console.error('[Connector] MySQL Connection failed:', e)
        if (getErrorCode(e) === 'ER_ACCESS_DENIED_ERROR') {
           console.error('[Connector] Hint: Check your username and password.')
        }
        throw e
      }
    }
  }

  /**
   * 获取所有数据表
   */
  async listTables(config: DBConnectionConfig): Promise<DBTableInfo[]> {
    const password = secureGet(`db_pass_${config.id}`) || ''
    const extra = parseExtraParams(config.params)
    
    try {
      if (config.type === 'postgres') {
        const { Client } = await import('pg')
        const client = new Client({ 
          host: config.host, 
          port: config.port, 
          user: config.user, 
          password, 
          database: config.database,
          ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
          ...extra
        })
        await client.connect()
        const res = await client.query(`
          SELECT table_name as name, table_schema as schema 
          FROM information_schema.tables 
          WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
          ORDER BY table_name
        `)
        await client.end()
        return res.rows
      } else {
        const mysql = await import('mysql2/promise')
        const connection = await mysql.createConnection({
          host: config.host,
          port: config.port,
          user: config.user,
          password: password,
          database: config.database,
          charset: 'UTF8MB4',
          ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
          ...extra
        })
        await connection.query("SET NAMES 'utf8mb4'")
        const [rows] = await connection.execute('SHOW TABLES')
        await connection.end()
        return (rows as RowRecord[]).map(row => ({
          name: String(Object.values(row)[0] ?? '')
        }))
      }
    } catch (e: unknown) {
      console.error(`[Connector] listTables failed for ${config.name} (${config.type}):`, e)
      throw e
    }
  }

  /**
   * 获取表结构和预览数据
   */
    async previewTable(config: DBConnectionConfig, tableName: string): Promise<PreviewTableResult> {
      const password = secureGet(`db_pass_${config.id}`) || ''
      const escapedName = escapeTableName(tableName, config.type)
      const extra = parseExtraParams(config.params)
      
      if (config.type === 'postgres') {
        const { Client } = await import('pg')
        const client = new Client({ 
          host: config.host, 
          port: config.port, 
          user: config.user, 
          password, 
          database: config.database,
          ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
          ...extra
        })
        await client.connect()
        
        const { schema, table } = parseTableId(tableName)
        // [ENHANCED] Fetch PKs and Comments
        const colQuery = `
          SELECT 
            c.column_name, 
            c.data_type, 
            c.is_nullable,
            pg_catalog.col_description(format('%s.%s', c.table_schema, c.table_name)::regclass::oid, c.ordinal_position) as column_comment,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT kcu.column_name, kcu.table_schema, kcu.table_name
            FROM information_schema.table_constraints tco
            JOIN information_schema.key_column_usage kcu 
              ON kcu.constraint_name = tco.constraint_name
              AND kcu.table_schema = tco.table_schema
              AND kcu.table_name = tco.table_name
            WHERE tco.constraint_type = 'PRIMARY KEY'
          ) pk ON c.column_name = pk.column_name 
              AND c.table_schema = pk.table_schema 
              AND c.table_name = pk.table_name
          WHERE c.table_name = $1 
          ${schema ? 'AND c.table_schema = $2' : ''}
          ORDER BY c.ordinal_position
        `
        const params = schema ? [table, schema] : [table]
        const colRes = await client.query(colQuery, params)
        
        const dataRes = await client.query(`SELECT * FROM ${escapedName} LIMIT 100`)
        const countRes = await client.query(`SELECT COUNT(*) as count FROM ${escapedName}`) 
        
        await client.end()
        
        return {
          columns: colRes.rows.map(r => ({
            name: r.column_name,
            type: normalizeDuckDBType(r.data_type),
            nullable: r.is_nullable === 'YES',
            isPrimaryKey: r.is_pk,
            description: r.column_comment || undefined
          })),
          preview: dataRes.rows,
          rowCount: parseInt(countRes.rows[0].count)
        }
      } else {
        const mysql = await import('mysql2/promise')
        const conn = await mysql.createConnection({
          host: config.host, port: config.port, user: config.user, password, database: config.database,
          charset: 'UTF8MB4', decimalNumbers: true,
          ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
          ...extra
        })
        await conn.query("SET NAMES 'utf8mb4'")
        // [ENHANCED] MySQL SHOW FULL COLUMNS includes Comment and Key info
        const [cols] = await conn.execute(`SHOW FULL COLUMNS FROM ${escapedName}`)
        const [data] = await conn.execute(`SELECT * FROM ${escapedName} LIMIT 100`)
        const [count] = await conn.execute(`SELECT COUNT(*) as count FROM ${escapedName}`)
        await conn.end()
        return {
          columns: (cols as MysqlShowColumnRow[]).map(r => ({
            name: r.Field,
            type: normalizeDuckDBType(r.Type),
            nullable: r.Null === 'YES',
            isPrimaryKey: r.Key === 'PRI',
            description: r.Comment || undefined
          })),
          preview: data as RowRecord[],
          rowCount: Number((count as Array<{ count: number | string | bigint }>)[0].count)
        }
      }
    }

  /**
   * Sync table data to local DuckDB (Snapshot Mode)
   * Using Streaming to support massive datasets.
   * v1.6.2: Stops at CSV generation to align with Excel workflow.
   */
    async syncTable(config: DBConnectionConfig, tableName: string) {
      const preview = await this.previewTable(config, tableName)
      const columnNames = preview.columns.map(c => c.name)
      const escapedName = escapeTableName(tableName, config.type)
      
      await TempFileManager.ensureTempDir()
      const tempPath = TempFileManager.getTempFilePath('.csv')
      const writeStream = fs.createWriteStream(tempPath)
      
      console.log(`[Connector] Streaming sync to disk: ${tableName} -> ${tempPath}`)
  
      try {
        if (config.type === 'postgres') {
            const { Client } = await import('pg')
            const QueryStream = (await import('pg-query-stream')).default
            const client = new Client({ host: config.host, port: config.port, user: config.user, password: secureGet(`db_pass_${config.id}`) || '', database: config.database })
            await client.connect()
            const query = new QueryStream(`SELECT * FROM ${escapedName}`)
            const stream = client.query(query)
            await pipeline(stream, new CSVFormatter(columnNames), writeStream)
            await client.end()
        } else {
            const mysql = await import('mysql2')
            const conn = mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: secureGet(`db_pass_${config.id}`) || '', database: config.database, charset: 'UTF8MB4', decimalNumbers: true })
            await new Promise((res, rej) => conn.query("SET NAMES 'utf8mb4'", (err) => err ? rej(err) : res(true)))
            const stream = conn.query(`SELECT * FROM ${escapedName}`).stream()
            await pipeline(stream, new CSVFormatter(columnNames), writeStream)
            conn.end()
        }
        return { success: true, rowCount: preview.rowCount, columns: preview.columns, preview: preview.preview, tempFilePath: tempPath }
      } catch (error) {
        console.error('[Connector] Streaming sync failed:', error)
        await TempFileManager.secureUnlink(tempPath)
        throw error
      }
    }}
