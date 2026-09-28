import {
  ColumnSchema as _ColumnSchema,
  TableSchema as _TableSchema,
} from '../types'

export interface IngestPreCheckParams {
  filePath: string
  targetTableName: string
  sourceTableName?: string // [NEW] If data is already in a temp table (DB sync)
  sheetName?: string
  uniqueKeys?: string[]
  columnMapping: Record<string, string | null>
  tempFilePath?: string // Cached CSV path
  readOptions?: Record<string, unknown>
}

export interface IngestPreCheckResponse {
  totalRows: number
  duplicateRows: number
  columnMatch: {
    matched: string[]
    missing: string[]
    extra: string[]
  }
}

export interface AppendDataParams {
  filePath: string
  targetTableName: string
  sourceTableName?: string // [NEW]
  sheetName?: string
  uniqueKeys?: string[]
  strategy: 'ignore' | 'replace' | 'update'
  columnMapping: Record<string, string | null>
  tempFilePath?: string // Cached CSV path
  limitRows?: number // Max rows allowed
  readOptions?: Record<string, unknown>
}

export interface CreateTableParams {
  filePath: string
  tableName: string // Target Table Name
  sourceTableName?: string // [NEW] If data is already in a temp table
  sheetName?: string
  columns: Array<{ name: string; type: string; isIgnored?: boolean }> // User-confirmed types and filters
  tempFilePath?: string // Cached CSV path
  limitRows?: number // Max rows allowed
  readOptions?: Record<string, unknown> // Options used to read the file
}

export interface ValidateColumnTypesParams {
  filePath: string
  tempFilePath?: string
  sourceTableName?: string // [NEW]
  columns: Array<{ name: string; type: string }>
  readOptions?: Record<string, unknown>
}
