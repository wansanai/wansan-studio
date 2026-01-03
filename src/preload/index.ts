import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { ElectronAPI } from '../shared/electron-api'

// 定义暴露给渲染进程的 API
const electronAPI: ElectronAPI = {
  // IPC 通信
  invoke: (channel: string, ...args: any[]) =>
    ipcRenderer.invoke(channel, ...args),

  // 文件操作
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectFiles: () => ipcRenderer.invoke('select-files'), // 多文件选择
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  parseFile: (filePath: string) => ipcRenderer.invoke('parse-file', filePath),

  // 数据库操作
  runSQL: (sql: string) => ipcRenderer.invoke('run-sql', sql),
  getUniqueTableName: (name: string, sheetName?: string) =>
    ipcRenderer.invoke('get-unique-table-name', name, sheetName),
  generateSQL: (prompt: string, schema: any) =>
    ipcRenderer.invoke('generate-sql', prompt, schema),
  getSchema: (tableName?: string) =>
    ipcRenderer.invoke('get-schema', tableName),
  deleteTable: (tableName: string) =>
    ipcRenderer.invoke('delete-table', tableName),
  resetDB: () => ipcRenderer.invoke('reset-db'),
  resetApp: () => ipcRenderer.invoke('reset-app'),

  // AI 功能
  askAI: (
    query: string,
    schemas: any[],
    relations: any[],
    context?: { lastSql: string; lastQuery: string },
    language?: 'en' | 'zh',
    domainRules?: any[]
  ) =>
    ipcRenderer.invoke(
      'ask-ai',
      query,
      schemas,
      relations,
      context,
      language,
      domainRules
    ),
  fixSQL: (
    originalSql: string,
    error: string,
    schemas: any[],
    domainRules?: any[]
  ) =>
    ipcRenderer.invoke('ask-ai-fix', originalSql, error, schemas, domainRules),
  analyzeContext: (schemas: any[], language?: 'en' | 'zh') =>
    ipcRenderer.invoke('analyze-context', schemas, language),
  generateMetricExpression: (options: {
    input: string
    columns: Array<{ name: string; type: string }>
    mode: 'generate' | 'refine'
  }) => ipcRenderer.invoke('ai:generate-metric-expression', options),
  generateUI: (userQuery: string, dataSample: any[]) =>
    ipcRenderer.invoke('ai:generate-ui', userQuery, dataSample),
  getAIConfig: () => ipcRenderer.invoke('get-ai-config'),
  setAIConfig: (config: any) => ipcRenderer.invoke('set-ai-config', config),
  clearAIConfig: () => ipcRenderer.invoke('clear-ai-config'),
  verifyAIConnection: (config?: any) =>
    ipcRenderer.invoke('verify-ai-connection', config),

  // 文件同步
  checkFilesConsistency: (files: any[]) =>
    ipcRenderer.invoke('check-files-consistency', files),
  reIngestFile: (
    fileId: string,
    filePath: string,
    tableName: string,
    sheetName?: string,
    columns?: any[]
  ) =>
    ipcRenderer.invoke(
      're-ingest-file',
      fileId,
      filePath,
      tableName,
      sheetName,
      columns
    ),
  ingestPreCheck: (params: any) =>
    ipcRenderer.invoke('ingest:pre-check', params),
  appendData: (params: any) => ipcRenderer.invoke('ingest:append', params),
  createTableFromSource: (params: any) =>
    ipcRenderer.invoke('ingest:create-table', params),
  cleanupIngestion: (tempTableNames: string[], tempFilePaths?: string[]) =>
    ipcRenderer.invoke('ingest:cleanup', tempTableNames, tempFilePaths),

  cleanupAllStaging: () => ipcRenderer.invoke('ingest:cleanup-all-staging'),

  // 导出功能
  exportPDF: (data: any) => ipcRenderer.invoke('export-pdf', data),
  saveImage: (dataUrl: string, name?: string) =>
    ipcRenderer.invoke('save-image', dataUrl, name),
  saveFile: (content: string, extension: string, name: string) =>
    ipcRenderer.invoke('save-file', content, extension, name),
  exportReport: (payload: {
    type: 'pdf' | 'html' | 'png'
    title: string
    layoutOptions: { isA4: boolean; landscape?: boolean }
  }) => ipcRenderer.invoke('export-report', payload),
  exportWebReport: (widgets: any[], config: any) =>
    ipcRenderer.invoke('export-web-report', widgets, config),

  // 系统信息
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  getUserInfo: () => ipcRenderer.invoke('get-user-info'),
  getPath: (name: string) => ipcRenderer.invoke('get-path', name),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  secureSet: (key: string, value: string) =>
    ipcRenderer.invoke('secure-set', key, value),
  secureGet: (key: string) => ipcRenderer.invoke('secure-get', key),
  validateLicense: (key: string) => ipcRenderer.invoke('validate-license', key),
  platform: process.platform,
  version: process.versions,
  windowControl: (
    action: 'enter-fullscreen' | 'exit-fullscreen' | 'toggle-maximize'
  ) => ipcRenderer.send('window-control', action),

  // Open external URLs in user's default browser
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  setLanguage: (lang: 'en' | 'zh') =>
    ipcRenderer.invoke('app:set-language', lang),

  // 事件监听
  onWindowStateChanged: (
    callback: (state: { isFullScreen: boolean }) => void
  ) => {
    const listener = (_event: any, state: { isFullScreen: boolean }) =>
      callback(state)
    ipcRenderer.on('window-state-changed', listener)
    return () => ipcRenderer.removeListener('window-state-changed', listener)
  },
  onFileProgress: (
    callback: (data: { fileId: string; progress: number }) => void
  ) => {
    const listener = (
      _event: any,
      data: { fileId: string; progress: number }
    ) => callback(data)
    ipcRenderer.on('file:progress', listener)
    return () => ipcRenderer.removeListener('file:progress', listener)
  },
  onParseProgress: (
    callback: (data: { filePath: string; count: number }) => void
  ) => {
    const listener = (_event: any, data: { filePath: string; count: number }) =>
      callback(data)
    ipcRenderer.on('file:parse-progress', listener)
    return () => ipcRenderer.removeListener('file:parse-progress', listener)
  },
  onCommandCloseProject: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('command:close-project', listener)
    return () => ipcRenderer.removeListener('command:close-project', listener)
  },
  onRemoteConfig: (callback: (config: any) => void) => {
    const listener = (_event: any, config: any) => callback(config)
    ipcRenderer.on('app:remote-config', listener)
    return () => ipcRenderer.removeListener('app:remote-config', listener)
  },
}

// 将 API 暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
