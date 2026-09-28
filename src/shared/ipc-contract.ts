import {
  AIConfig,
  ColumnSchema,
  DomainRule,
  ReloadResult,
  TableSchema,
  SemanticAnalysisResult,
} from './types'
import { InsightGenerationContext } from './types/dashboard'
import {
  AIConfigResponse,
  AnalyzeContextResponse,
  AskAIResponse,
  ExportExcelPayload,
  GetSchemaResponse,
  IPCResponse,
  ParseFileResponse,
  RunSQLResponse,
} from './api-types'
import { FilterParam } from './schemas/analysis'
import { TokenBudgetConfig } from './types/token-audit'
import {
  IngestPreCheckParams,
  IngestPreCheckResponse,
  AppendDataParams,
  CreateTableParams,
  ValidateColumnTypesParams,
} from './types/ipc-params'
import type { ProjectLoadResult } from './types/project-manifest'

/**
 * Single Source of Truth for all IPC communications.
 * Standard Naming: 'domain.methodName'
 */
export interface IPCContract {
  // --- File Operations ---
  'file.selectFile': { params: void; return: IPCResponse<string> }
  'file.selectFiles': { params: void; return: IPCResponse<{ path: string; size: number }[]> }
  'file.selectDirectory': { params: void; return: IPCResponse<string> }
  'file.parseFile': { params: string; return: ParseFileResponse }
  'file.inspectFile': { params: string; return: IPCResponse<Array<{ sourceName: string; previewHeaders?: string[]; readOptions?: Record<string, unknown> }>> }
  'file.prepareFile': { 
    params: { filePath: string; sourceName: string; readOptions?: Record<string, unknown> }
    return: IPCResponse<{ tempFilePath: string; rowCount: number; columns: ColumnSchema[]; preview: unknown[] }> 
  }
  'file.validateColumnTypes': { params: ValidateColumnTypesParams; return: IPCResponse<{ valid: boolean; error?: string; errorDetail?: { column: string; value: string; type: string } }> }
  'file.reIngestFile': { 
    params: { fileId: string; filePath: string; tableName: string; sheetName?: string; columns?: ColumnSchema[]; readOptions?: Record<string, unknown> }
    return: IPCResponse<ReloadResult> 
  }
  'file.getUniqueTableName': { params: { name: string; sheetName?: string }; return: IPCResponse<string> }

  // --- Ingestion ---
  'ingest.ingestPreCheck': { params: IngestPreCheckParams; return: IPCResponse<IngestPreCheckResponse> }
  'ingest.appendData': { params: AppendDataParams; return: IPCResponse<{ rowCount: number }> }
  'ingest.createTableFromSource': { params: CreateTableParams; return: IPCResponse<{ rowCount: number; columns: ColumnSchema[] }> }
  'ingest.cleanupIngestion': { params: { tempTableNames: string[]; tempFilePaths?: string[] }; return: IPCResponse }
  'ingest.cleanupAllStaging': { params: void; return: IPCResponse }
  'ingest.ingestJson': { params: { tableName: string; rows: unknown[] }; return: IPCResponse<unknown> }

  // --- Database Connectors ---
  'db.testDBConnection': { params: { config: import('./types').DBConnectionConfig; password?: string }; return: IPCResponse<boolean> }
  'db.listDBTables': { params: import('./types').DBConnectionConfig; return: IPCResponse<Array<{ name: string; schema?: string }>> }
  'db.syncDBTable': { params: { config: import('./types').DBConnectionConfig; tableName: string }; return: IPCResponse<{ rowCount: number; columns: Array<{ name: string; type: string; nullable: boolean }> }> }

  // --- Database Core ---
  'sql.runSQL': { params: string; return: RunSQLResponse }
  'sql.generateSQL': { params: { prompt: string; schema: TableSchema[] }; return: IPCResponse<string> }
  'db.getSchema': { params: string | undefined; return: GetSchemaResponse }
  'db.deleteTable': { params: string; return: IPCResponse }
  'db.resetDB': { params: void; return: IPCResponse }
  'app.resetApp': { params: void; return: IPCResponse }

  // --- AI & Analysis ---
  'ai.askAI': { 
    params: { userQuery: string; schemas: TableSchema[]; context?: { lastSql: string; lastQuery: string }; language?: 'en' | 'zh'; domainRules?: DomainRule[]; suggestionCount?: number }
    return: AskAIResponse 
  }
  'ai.fixSQL': { 
    params: { originalSql: string; error: string; schemas: TableSchema[]; domainRules?: DomainRule[] }
    return: IPCResponse<{ sql: string; reasoning: string; is_template?: boolean; missing_params?: FilterParam[] }> 
  }
  'ai.analyzeContext': { params: { schemas: TableSchema[]; language?: 'en' | 'zh' }; return: AnalyzeContextResponse }
  'ai.analyzeSemantics': { params: { tableName: string; columns: ColumnSchema[]; language?: 'en' | 'zh' }; return: IPCResponse<SemanticAnalysisResult> }
  'ai.generateMetricExpression': { params: { input: string; columns: Array<{ name: string; type: string }>; mode: 'generate' | 'refine' }; return: IPCResponse<string> }
  'ai.generateInsight': { params: InsightGenerationContext; return: IPCResponse<string> }
  'ai.aiPreviewExtract': { params: { tableName: string; columnName: string; sampleData: unknown[]; prompt: string }; return: IPCResponse<{ results: string[]; estimatedCost: number }> }
  'ai.aiBatchExtract': { params: { tableName: string; columnName: string; targetColumnName: string; prompt: string }; return: IPCResponse<{ jobId: string }> }
  'ai.dropAIColumn': { params: { tableName: string; columnName: string }; return: IPCResponse }


  // --- Token Audit ---
  'audit.getTokenConfig': { params: void; return: IPCResponse<TokenBudgetConfig> }
  'audit.setTokenConfig': { params: Partial<TokenBudgetConfig>; return: IPCResponse }
  'audit.getTokenUsage': { params: void; return: IPCResponse<{ dailyUsageUSD: number; inputTokens: number; outputTokens: number; totalUsage: { usd: number; input: number; output: number } }> }

  // --- AI Config ---
  'ai.getAIConfig': { params: void; return: AIConfigResponse }
  'ai.setAIConfig': { params: AIConfig; return: IPCResponse }
  'ai.clearAIConfig': { params: void; return: IPCResponse }
  'ai.verifyAIConnection': { params: AIConfig | undefined; return: IPCResponse }

  // --- Export ---
  'export.exportPDF': { params: unknown; return: IPCResponse }
  'export.exportReport': { params: unknown; return: IPCResponse }
  'export.exportWebReport': { params: { widgets: unknown[]; config: { title: string; theme: string; language?: 'en' | 'zh' }; fullSnapshot?: unknown }; return: IPCResponse }
  'export.exportExcel': { params: ExportExcelPayload; return: IPCResponse<string> }
  'save.saveImage': { params: { dataUrl: string; name?: string }; return: IPCResponse<string> }
  'save.saveFile': { params: { content: string; extension: string; name: string }; return: IPCResponse<string> }

  // --- System ---
  'sys.getDeviceId': { params: void; return: IPCResponse<string> }
  'sys.getUserInfo': { params: void; return: IPCResponse<{ username: string }> }
  'sys.getPath': { params: string; return: IPCResponse<string> }
  'sys.getAppVersion': { params: void; return: IPCResponse<string> }
  'sys.getMainLogs': { params: void; return: IPCResponse<unknown[]> }
  'sys.secureSet': { params: { key: string; value: string }; return: IPCResponse<boolean> }
  'sys.secureGet': { params: string; return: IPCResponse<string | null> }
  'sys.validateLicense': { params: string; return: IPCResponse<boolean> }
  'sys.openExternal': { params: string; return: IPCResponse }
  'sys.showItemInFolder': { params: string; return: IPCResponse }
  'app.setLanguage': { params: 'en' | 'zh'; return: IPCResponse }

  // --- Project Management ---
  'project.projectCreate': { params: { name: string; location?: string }; return: IPCResponse<string> }
  'project.projectOpen': { params: string | undefined; return: IPCResponse<ProjectLoadResult> }
  'project.projectSave': { params: { path: string; data: import('./types/project-manifest').ProjectSavePayload }; return: IPCResponse }
  'project.projectClose': { params: void; return: IPCResponse }
  'project.projectGetDefaultPath': { params: void; return: IPCResponse<string> }
}
