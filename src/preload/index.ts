import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent,
  webUtils,
} from 'electron'
import { ElectronAPI } from '../shared/electron-api'
import { InsightGenerationContext } from '../shared/types/dashboard'

type FirstArg<T extends (...args: unknown[]) => unknown> = Parameters<T>[0]
type CallbackPayload<T> = T extends (payload: infer P) => unknown ? P : never

type PrepareFileParams = FirstArg<ElectronAPI['prepareFile']>
type UniqueTableNameParams = FirstArg<ElectronAPI['getUniqueTableName']>
type GenerateSQLParams = FirstArg<ElectronAPI['generateSQL']>
type AskAIParams = FirstArg<ElectronAPI['askAI']>
type FixSQLParams = FirstArg<ElectronAPI['fixSQL']>
type AnalyzeContextParams = FirstArg<ElectronAPI['analyzeContext']>
type AnalyzeSemanticsParams = FirstArg<ElectronAPI['analyzeSemantics']>
type GenerateMetricExpressionParams = FirstArg<ElectronAPI['generateMetricExpression']>
type AIPreviewExtractParams = FirstArg<ElectronAPI['aiPreviewExtract']>
type AIBatchExtractParams = FirstArg<ElectronAPI['aiBatchExtract']>
type DropAIColumnParams = FirstArg<ElectronAPI['dropAIColumn']>
type SetTokenConfigParams = FirstArg<ElectronAPI['setTokenConfig']>
type SetAIConfigParams = FirstArg<ElectronAPI['setAIConfig']>
type VerifyAIConnectionParams = FirstArg<ElectronAPI['verifyAIConnection']>
type ValidateColumnTypesParams = FirstArg<ElectronAPI['validateColumnTypes']>
type ReIngestFileParams = FirstArg<ElectronAPI['reIngestFile']>
type IngestPreCheckParams = FirstArg<ElectronAPI['ingestPreCheck']>
type AppendDataParams = FirstArg<ElectronAPI['appendData']>
type CreateTableFromSourceParams = FirstArg<ElectronAPI['createTableFromSource']>
type CleanupIngestionParams = FirstArg<ElectronAPI['cleanupIngestion']>
type IngestJsonParams = FirstArg<ElectronAPI['ingestJson']>
type TestDBConnectionParams = FirstArg<ElectronAPI['testDBConnection']>
type ListDBTablesParams = FirstArg<ElectronAPI['listDBTables']>
type SyncDBTableParams = FirstArg<ElectronAPI['syncDBTable']>
type ExportPDFParams = FirstArg<ElectronAPI['exportPDF']>
type SaveImageParams = FirstArg<ElectronAPI['saveImage']>
type SaveFileParams = FirstArg<ElectronAPI['saveFile']>
type ExportReportParams = FirstArg<ElectronAPI['exportReport']>
type ExportWebReportParams = FirstArg<ElectronAPI['exportWebReport']>
type ExportExcelParams = FirstArg<ElectronAPI['exportExcel']>
type SecureSetParams = FirstArg<ElectronAPI['secureSet']>
type ProjectCreateParams = FirstArg<ElectronAPI['projectCreate']>
type ProjectSaveParams = FirstArg<ElectronAPI['projectSave']>

type WindowStateCallback = FirstArg<ElectronAPI['onWindowStateChanged']>
type WindowState = CallbackPayload<WindowStateCallback>
type FileProgressCallback = FirstArg<ElectronAPI['onFileProgress']>
type FileProgressData = CallbackPayload<FileProgressCallback>
type ParseProgressCallback = FirstArg<ElectronAPI['onParseProgress']>
type ParseProgressData = CallbackPayload<ParseProgressCallback>
type RemoteConfigCallback = FirstArg<ElectronAPI['onRemoteConfig']>
type RemoteConfigData = CallbackPayload<RemoteConfigCallback>
type BatchProgressCallback = FirstArg<ElectronAPI['onBatchProgress']>
type BatchProgressData = CallbackPayload<BatchProgressCallback>
type BatchCompleteCallback = FirstArg<ElectronAPI['onBatchComplete']>
type BatchCompleteData = CallbackPayload<BatchCompleteCallback>

const electronAPI: ElectronAPI = {
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),

  selectFile: () => ipcRenderer.invoke('file.selectFile'),
  selectFiles: () => ipcRenderer.invoke('file.selectFiles'),
  selectDirectory: () => ipcRenderer.invoke('file.selectDirectory'),
  parseFile: (filePath: string) => ipcRenderer.invoke('file.parseFile', filePath),
  inspectFile: (filePath: string) =>
    ipcRenderer.invoke('file.inspectFile', filePath),
  prepareFile: (params: PrepareFileParams) =>
    ipcRenderer.invoke('file.prepareFile', params),

  runSQL: (sql: string) => ipcRenderer.invoke('sql.runSQL', sql),
  getUniqueTableName: (params: UniqueTableNameParams) =>
    ipcRenderer.invoke('file.getUniqueTableName', params),
  generateSQL: (params: GenerateSQLParams) =>
    ipcRenderer.invoke('sql.generateSQL', params),
  getSchema: (tableName?: string) => ipcRenderer.invoke('db.getSchema', tableName),
  deleteTable: (tableName: string) =>
    ipcRenderer.invoke('db.deleteTable', tableName),
  resetDB: () => ipcRenderer.invoke('db.resetDB'),
  resetApp: () => ipcRenderer.invoke('app.resetApp'),

  askAI: (params: AskAIParams) => ipcRenderer.invoke('ai.askAI', params),
  fixSQL: (params: FixSQLParams) => ipcRenderer.invoke('ai.fixSQL', params),
  analyzeContext: (params: AnalyzeContextParams) =>
    ipcRenderer.invoke('ai.analyzeContext', params),
  analyzeSemantics: (params: AnalyzeSemanticsParams) =>
    ipcRenderer.invoke('ai.analyzeSemantics', params),
  generateMetricExpression: (options: GenerateMetricExpressionParams) =>
    ipcRenderer.invoke('ai.generateMetricExpression', options),
  generateInsight: (context: InsightGenerationContext) =>
    ipcRenderer.invoke('ai.generateInsight', context),
  aiPreviewExtract: (params: AIPreviewExtractParams) =>
    ipcRenderer.invoke('ai.aiPreviewExtract', params),
  aiBatchExtract: (params: AIBatchExtractParams) =>
    ipcRenderer.invoke('ai.aiBatchExtract', params),
  dropAIColumn: (params: DropAIColumnParams) =>
    ipcRenderer.invoke('ai.dropAIColumn', params),

  getTokenConfig: () => ipcRenderer.invoke('audit.getTokenConfig'),
  setTokenConfig: (config: SetTokenConfigParams) =>
    ipcRenderer.invoke('audit.setTokenConfig', config),
  getTokenUsage: () => ipcRenderer.invoke('audit.getTokenUsage'),

  getAIConfig: () => ipcRenderer.invoke('ai.getAIConfig'),
  setAIConfig: (config: SetAIConfigParams) =>
    ipcRenderer.invoke('ai.setAIConfig', config),
  clearAIConfig: () => ipcRenderer.invoke('ai.clearAIConfig'),
  verifyAIConnection: (config?: VerifyAIConnectionParams) =>
    ipcRenderer.invoke('ai.verifyAIConnection', config),

  validateColumnTypes: (params: ValidateColumnTypesParams) =>
    ipcRenderer.invoke('file.validateColumnTypes', params),
  reIngestFile: (params: ReIngestFileParams) =>
    ipcRenderer.invoke('file.reIngestFile', params),
  ingestPreCheck: (params: IngestPreCheckParams) =>
    ipcRenderer.invoke('ingest.ingestPreCheck', params),
  appendData: (params: AppendDataParams) =>
    ipcRenderer.invoke('ingest.appendData', params),
  createTableFromSource: (params: CreateTableFromSourceParams) =>
    ipcRenderer.invoke('ingest.createTableFromSource', params),
  cleanupIngestion: (params: CleanupIngestionParams) =>
    ipcRenderer.invoke('ingest.cleanupIngestion', params),
  cleanupAllStaging: () => ipcRenderer.invoke('ingest.cleanupAllStaging'),
  ingestJson: (params: IngestJsonParams) =>
    ipcRenderer.invoke('ingest.ingestJson', params),

  testDBConnection: (params: TestDBConnectionParams) =>
    ipcRenderer.invoke('db.testDBConnection', params),
  listDBTables: (config: ListDBTablesParams) =>
    ipcRenderer.invoke('db.listDBTables', config),
  syncDBTable: (params: SyncDBTableParams) =>
    ipcRenderer.invoke('db.syncDBTable', params),

  exportPDF: (data: ExportPDFParams) => ipcRenderer.invoke('export.exportPDF', data),
  saveImage: (params: SaveImageParams) => ipcRenderer.invoke('save.saveImage', params),
  saveFile: (params: SaveFileParams) => ipcRenderer.invoke('save.saveFile', params),
  exportReport: (payload: ExportReportParams) =>
    ipcRenderer.invoke('export.exportReport', payload),
  exportWebReport: (params: ExportWebReportParams) =>
    ipcRenderer.invoke('export.exportWebReport', params),
  exportExcel: (payload: ExportExcelParams) =>
    ipcRenderer.invoke('export.exportExcel', payload),

  getDeviceId: () => ipcRenderer.invoke('sys.getDeviceId'),
  getUserInfo: () => ipcRenderer.invoke('sys.getUserInfo'),
  getPath: (name: string) => ipcRenderer.invoke('sys.getPath', name),
  getAppVersion: () => ipcRenderer.invoke('sys.getAppVersion'),
  getMainLogs: () => ipcRenderer.invoke('sys.getMainLogs'),
  secureSet: (params: SecureSetParams) => ipcRenderer.invoke('sys.secureSet', params),
  secureGet: (key: string) => ipcRenderer.invoke('sys.secureGet', key),
  validateLicense: (key: string) => ipcRenderer.invoke('sys.validateLicense', key),
  platform: process.platform,
  version: process.versions,
  windowControl: action => ipcRenderer.send('window-control', action),

  openExternal: (url: string) => ipcRenderer.invoke('sys.openExternal', url),
  showItemInFolder: (path: string) =>
    ipcRenderer.invoke('sys.showItemInFolder', path),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  setLanguage: (lang: 'en' | 'zh') => ipcRenderer.invoke('app.setLanguage', lang),

  projectCreate: (params: ProjectCreateParams) =>
    ipcRenderer.invoke('project.projectCreate', params),
  projectOpen: (projectPath?: string) =>
    ipcRenderer.invoke('project.projectOpen', projectPath),
  projectSave: (params: ProjectSaveParams) =>
    ipcRenderer.invoke('project.projectSave', params),
  projectClose: () => ipcRenderer.invoke('project.projectClose'),
  projectGetDefaultPath: () => ipcRenderer.invoke('project.projectGetDefaultPath'),

  onWindowStateChanged: (callback: WindowStateCallback) => {
    const listener = (_event: IpcRendererEvent, state: WindowState) => callback(state)
    ipcRenderer.on('window-state-changed', listener)
    return () => ipcRenderer.removeListener('window-state-changed', listener)
  },
  onFileProgress: (callback: FileProgressCallback) => {
    const listener = (_event: IpcRendererEvent, data: FileProgressData) => callback(data)
    ipcRenderer.on('file:progress', listener)
    return () => ipcRenderer.removeListener('file:progress', listener)
  },
  onParseProgress: (callback: ParseProgressCallback) => {
    const listener = (_event: IpcRendererEvent, data: ParseProgressData) => callback(data)
    ipcRenderer.on('file:parse-progress', listener)
    return () => ipcRenderer.removeListener('file:parse-progress', listener)
  },
  onCommandCloseProject: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('command:close-project', listener)
    return () => ipcRenderer.removeListener('command:close-project', listener)
  },
  onRemoteConfig: (callback: RemoteConfigCallback) => {
    const listener = (_event: IpcRendererEvent, config: RemoteConfigData) =>
      callback(config)
    ipcRenderer.on('app:remote-config', listener)
    return () => ipcRenderer.removeListener('app:remote-config', listener)
  },
  onBatchProgress: (callback: BatchProgressCallback) => {
    const listener = (_event: IpcRendererEvent, data: BatchProgressData) =>
      callback(data)
    ipcRenderer.on('ai:batch-progress', listener)
    return () => ipcRenderer.removeListener('ai:batch-progress', listener)
  },
  onBatchComplete: (callback: BatchCompleteCallback) => {
    const listener = (_event: IpcRendererEvent, data: BatchCompleteData) =>
      callback(data)
    ipcRenderer.on('ai:batch-complete', listener)
    return () => ipcRenderer.removeListener('ai:batch-complete', listener)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
