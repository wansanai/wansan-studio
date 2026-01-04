import {
  ReloadResult,
  DomainRule,
  ColumnSchema,
  TableSchema,
  RelationSuggestion,
  AppConfig,
  AIConfig,
  FileNode,
} from './types'
import {
  IPCResponse,
  RunSQLResponse,
  ParseFileResponse,
  AIConfigResponse,
  GetSchemaResponse,
  AskAIResponse,
  AnalyzeContextResponse,
} from './api-types'
import { GenUIResponse } from './schemas/gen-ui'

export interface IngestPreCheckParams {
  filePath: string
  targetTableName: string
  sheetName?: string
  uniqueKeys?: string[]
  columnMapping: Record<string, string | null>
  tempFilePath?: string // Cached CSV path
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
  sheetName?: string
  uniqueKeys?: string[]
  strategy: 'ignore' | 'replace' | 'update'
  columnMapping: Record<string, string | null>
  tempFilePath?: string // Cached CSV path
  limitRows?: number // Max rows allowed
}

export interface CreateTableParams {
  filePath: string
  tableName: string
  sheetName?: string
  columns: Array<{ name: string; type: string }> // User-confirmed types
  tempFilePath?: string // Cached CSV path
  limitRows?: number // Max rows allowed
}

export interface ElectronAPI {
  // Generic invoke (keep for flexibility, but usage should be minimized)
  invoke: (channel: string, ...args: unknown[]) => Promise<IPCResponse>

  // File Operations
  selectFile: () => Promise<IPCResponse<string>>
  selectFiles: () => Promise<IPCResponse<{ path: string; size: number }[]>>
  selectDirectory: () => Promise<IPCResponse<string>>
  parseFile: (filePath: string) => Promise<ParseFileResponse>
  checkFilesConsistency: (files: FileNode[]) => Promise<IPCResponse>
  reIngestFile: (
    fileId: string,
    filePath: string,
    tableName: string,
    sheetName?: string,
    columns?: ColumnSchema[] // Add this
  ) => Promise<IPCResponse<ReloadResult>>
  ingestPreCheck: (
    params: IngestPreCheckParams
  ) => Promise<IPCResponse<IngestPreCheckResponse>>
  appendData: (
    params: AppendDataParams
  ) => Promise<IPCResponse<{ rowCount: number }>>
  createTableFromSource: (
    params: CreateTableParams
  ) => Promise<IPCResponse<{ rowCount: number; columns: ColumnSchema[] }>>
  cleanupIngestion: (
    tempTableNames: string[],
    tempFilePaths?: string[]
  ) => Promise<IPCResponse>
  cleanupAllStaging: () => Promise<IPCResponse>
  saveImage: (dataUrl: string, name?: string) => Promise<IPCResponse>
  saveFile: (
    content: string,
    extension: string,
    name: string
  ) => Promise<IPCResponse<boolean>>
  getPathForFile: (file: File) => string

  // Database Operations
  runSQL: (sql: string) => Promise<RunSQLResponse>
  getUniqueTableName: (
    name: string,
    sheetName?: string
  ) => Promise<IPCResponse<string>>
  getSchema: (tableName?: string) => Promise<GetSchemaResponse>
  deleteTable: (tableName?: string) => Promise<IPCResponse>
  resetDB: () => Promise<IPCResponse>
  resetApp: () => Promise<IPCResponse>

  // AI & Analysis
  generateSQL: (
    prompt: string,
    schema: TableSchema[]
  ) => Promise<IPCResponse<string>>
  askAI: (
    query: string,
    schemas: TableSchema[],
    relations: RelationSuggestion[],
    context?: { lastSql: string; lastQuery: string },
    language?: 'en' | 'zh',
    domainRules?: DomainRule[]
  ) => Promise<AskAIResponse>
  fixSQL: (
    originalSql: string,
    error: string,
    schemas: TableSchema[],
    domainRules?: DomainRule[]
  ) => Promise<IPCResponse<{ sql: string; reasoning: string }>>
  analyzeContext: (
    schemas: TableSchema[],
    language?: 'en' | 'zh'
  ) => Promise<AnalyzeContextResponse>
  generateMetricExpression: (options: {
    input: string
    columns: Array<{ name: string; type: string }>
    mode: 'generate' | 'refine'
  }) => Promise<IPCResponse<string>>
  generateUI: (
    userQuery: string,
    dataSample: any[]
  ) => Promise<IPCResponse<GenUIResponse>>
  generateSemanticUI: (
    userQuery: string,
    dataSample: any[]
  ) => Promise<IPCResponse<GenUIResponse>>

  // AI Config
  getAIConfig: () => Promise<AIConfigResponse>
  setAIConfig: (config: AIConfig) => Promise<IPCResponse>
  clearAIConfig: () => Promise<IPCResponse>
  verifyAIConnection: (config?: AIConfig) => Promise<IPCResponse>

  // Export
  exportPDF: (data: unknown) => Promise<IPCResponse>
  exportReport: (payload: unknown) => Promise<IPCResponse>
  exportWebReport: (widgets: unknown[], config: unknown) => Promise<IPCResponse>

  // System / Misc
  getDeviceId: () => Promise<IPCResponse<string>>
  getUserInfo: () => Promise<IPCResponse<{ username: string }>>
  getPath: (name: string) => Promise<IPCResponse<string>>
  getAppVersion: () => Promise<IPCResponse<string>>
  secureSet: (key: string, value: string) => Promise<IPCResponse<boolean>>
  secureGet: (key: string) => Promise<IPCResponse<string | null>>
  validateLicense: (key: string) => Promise<IPCResponse<boolean>>
  openExternal: (url: string) => Promise<IPCResponse>
  setLanguage: (lang: 'en' | 'zh') => Promise<IPCResponse>

  // Environment
  platform: string
  version: NodeJS.ProcessVersions

  // Window Control
  windowControl: (
    action: 'enter-fullscreen' | 'exit-fullscreen' | 'toggle-maximize'
  ) => void
  onWindowStateChanged: (
    callback: (state: { isFullScreen: boolean }) => void
  ) => () => void
  onFileProgress: (
    callback: (data: { fileId: string; progress: number }) => void
  ) => () => void
  onParseProgress: (
    callback: (data: {
      filePath: string
      count?: number
      isPercentage?: boolean
      progress?: number
    }) => void
  ) => () => void
  onCommandCloseProject: (callback: () => void) => () => void
  onRemoteConfig: (callback: (config: AppConfig) => void) => () => void
}
