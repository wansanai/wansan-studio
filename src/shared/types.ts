export type ColumnType =
  | 'VARCHAR'
  | 'DOUBLE'
  | 'BOOLEAN'
  | 'DATE'
  | 'INTEGER'
  | 'TIMESTAMP'

export interface ColumnSchema {
  name: string // Original column name (e.g., "销售额(万元)")
  safeName: string // Sanitized name for SQL (e.g., "销售额(万元)") - *DuckDB supports utf8, but quoting is mandatory*
  type: ColumnType // Inferred DuckDB type
  sampleValues: any[] // Top 3 non-null values for AI context
  nullable?: boolean // From UI state, indicates if column can have nulls
  isKey?: boolean // From UI state, indicates if column is a join key
  isPrimaryKey?: boolean // Optional metadata when a column is a primary key
  alias?: string // User defined alias for the column
  userType?: ColumnType // User defined type override
}

export interface TableSchema {
  tableName: string // Normalized table name (e.g., "t_orders")
  description?: string // Original file name for AI context (e.g., "Sales 2023.xlsx")
  columns: ColumnSchema[]
  smartMetrics?: SmartMetric[] // Metrics to be displayed in the schema
  tempFilePath?: string // Path to temporary file (e.g. converted CSV) for cleanup
  sheetName?: string // Source sheet name for Excel files
}

export interface AIAnalysisResult {
  status: 'success' | 'error'
  data?: any[] // Raw rows from DuckDB
  columns?: string[] // Column headers
  sql?: string // The Executed SQL

  // AI Context
  title?: string
  summary?: string
  reasoning?: string
  suggestions?: string[]
  error?: string

  // Visualization (Matching Prompt Structure)
  viz_type?:
    | 'bar'
    | 'line'
    | 'pie'
    | 'scatter'
    | 'table'
    | 'kpi'
    | 'area'
    | 'text'
    | 'gen-ui'
  viz_config?: {
    x_axis?: string | null
    y_axis?: string | string[] | null
    series_name?: string | string[]
  }

  // v1.2 Smart Filters
  is_template?: boolean
  missing_params?: Array<{
    placeholder: string
    label?: string
    column: string
    table: string
    display_columns?: string[]
    hint?: string
  }>
}

// [UPDATE] Add this new interface
export interface RelationSuggestion {
  sourceTable: string // e.g., "t_orders"
  sourceColumn: string // e.g., "product_id"
  targetTable: string // e.g., "t_products"
  targetColumn: string // e.g., "id"
  confidence: number // 0.0 to 1.0
  reason: string // Explanation for the UI (e.g. "Column names match")
}

export interface ContextAnalysisResult {
  relationships: RelationSuggestion[]
  suggestedPrompts: string[]
}

export type LoadingType = 'cleaning' | 'thinking' | 'crunching' | 'fixing'

export type SyncStatus =
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'error'
  | 'out-of-sync'
  | 'missing'

export interface SmartMetric {
  id: string // UUID
  name: string // Main name / identifier (e.g., "Profit Margin")
  safeName?: string // Technical identifier (reserved)
  alias?: string // User defined alias
  sqlExpression: string // SQL Fragment (e.g., "amount - products__cost")
  description?: string // Context for AI
  type?: ColumnType // Cached type (e.g., "DOUBLE")
}

export interface TableRelation {
  id: string
  targetFileId: string // Target Table ID
  sourceColumn: string // Local Column Name
  targetColumn: string // Remote Column Name
  joinType?: 'LEFT' | 'INNER' | 'FULL' // Default to LEFT
  autoDetected?: boolean
}

export interface FileNode {
  id: string
  name: string
  path: string
  tableName: string // DuckDB table name
  sheetName?: string // Excel Sheet Name
  status: SyncStatus
  progress?: number // 0-100
  size?: number
  columns: ColumnSchema[]
  rowCount?: number
  error?: string
  lastModified: number // Timestamp (ms) of file modification
  createdAt: number
  smartMetrics?: SmartMetric[] // Persisted metrics
  relations?: TableRelation[] // NEW: Stored per-file
}

export interface ReloadResult {
  lastModified: number
  newColumns: ColumnSchema[]
}

export interface AIConfig {
  apiKey?: string
  baseURL?: string
  model?: string
  provider?: string // [NEW] AI Provider name (e.g. "DeepSeek", "OpenAI", "Custom")
  isManaged?: boolean // [NEW] Indicates build-time injected config
  models?: string[] // [NEW] Supported models for the provider
}

export interface DomainRule {
  id: string
  content: string
  isEnabled: boolean
  createdAt: number
}

// 选中节点类型
export type SelectedNodeType = 'file' | 'column' | 'relation' | null

// 选中节点信息
export interface SelectedNode {
  id: string
  type: SelectedNodeType
  fileId?: string // 如果是 column，关联的文件 ID
  columnName?: string // 如果是 column，列名
  relationId?: string // 如果是 relation，关联 ID
}

export interface RemoteConfig {
  min_version?: string
  latest_version?: string
  download_url?: string
  beta_code?: string | string[]
  special_expiry?: string // 企业版有效期
  channel?: string
  announcement?: {
    id: string
    text: string | { [lang: string]: string }
    link?: string
    level?: 'info' | 'warning'
  } | null
  providers?: Record<string, any> // AIProviderConfig
}

// 组合类型：发送给前端的最终配置
export interface AppConfig extends RemoteConfig {
  isActivated?: boolean
  isSpecialChannel?: boolean
  isExpired?: boolean
  isOffline?: boolean
  betaCodes?: string[]
  managedAI?: {
    provider: string
    models: string[]
  }
}
