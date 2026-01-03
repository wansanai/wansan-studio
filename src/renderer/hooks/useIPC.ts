import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AIConfigResponse,
  AnalyzeContextResponse,
  AskAIResponse,
  IPCResponse,
  RunSQLResponse,
} from '@shared/api-types'
import { ElectronAPI } from '@shared/electron-api'
import { AIConfig, ColumnSchema, FileNode, TableSchema, } from '@shared/types'

/**
 * Mock IPC implementation for development/testing when electronAPI is not available.
 * This ensures the renderer can still run in a browser environment if needed.
 */
const mockIPC: ElectronAPI = {
  invoke: async () => ({ success: true }),
  selectFile: async () => ({ success: true, data: '' }),
  selectFiles: async () => ({ success: true, data: [] }),
  selectDirectory: async () => ({ success: true, data: '/mock/dir' }),
  parseFile: async () => ({ success: true, data: [] }),
  runSQL: async (): Promise<RunSQLResponse> => {
    await new Promise(r => setTimeout(r, 500))
    return { success: true, data: { data: [], columnFields: [] } }
  },
  getSchema: async () => ({ success: true, data: { tables: [] } }),
  deleteTable: async () => ({ success: true }),
  generateSQL: async () => ({ success: true, data: '' }),
  askAI: async (): Promise<AskAIResponse> => ({
    success: true,
    data: { status: 'success' },
  }),
  fixSQL: async () => ({
    success: true,
    data: { sql: '', reasoning: '' },
  }),
  analyzeContext: async (): Promise<AnalyzeContextResponse> => ({
    success: true,
    data: { relationships: [], suggestedPrompts: [] },
  }),
  generateMetricExpression: async () => ({
    success: true,
    data: '1 + 1',
  }),
  generateUI: async () => ({
    success: true,
    data: {
      spec: { html: '<div></div>', js: '' },
      reasoning: 'mock',
    },
  }),
  getAIConfig: async (): Promise<AIConfigResponse> => {
    return { success: true, data: {} }
  },
  setAIConfig: async () => ({ success: true }),
  clearAIConfig: async (): Promise<IPCResponse> => {
    return { success: true }
  },
  verifyAIConnection: async () => ({ success: true, data: true }),
  checkFilesConsistency: async (files: FileNode[]): Promise<IPCResponse> => {
    console.log('Mock checkFilesConsistency', files)
    return { success: true }
  },
  reIngestFile: async (
    _fileId: string,
    _filePath: string,
    _tableName: string,
    _sheetName?: string,
    _columns?: ColumnSchema[]
  ): Promise<IPCResponse<any>> => {
    return {
      success: true,
      data: { lastModified: Date.now(), newColumns: [] },
    }
  },
  ingestPreCheck: async () => ({
    success: true,
    data: {
      totalRows: 0,
      duplicateRows: 0,
      columnMatch: { matched: [], missing: [], extra: [] },
    },
  }),
  appendData: async () => ({ success: true, data: { rowCount: 0 } }),
  createTableFromSource: async () => ({
    success: true,
    data: { rowCount: 0, columns: [] },
  }),
  cleanupIngestion: async () => ({ success: true }),
  cleanupAllStaging: async () => ({ success: true }),
  getUniqueTableName: async () => ({ success: true, data: 't_mock' }),
  getDeviceId: async (): Promise<IPCResponse<string>> => {
    return { success: true, data: 'mock-device-id' }
  },
  secureSet: async (
    _key: string,
    _value: string
  ): Promise<IPCResponse<boolean>> => {
    return { success: true, data: true }
  },
  secureGet: async (_key: string): Promise<IPCResponse<string | null>> => {
    return { success: true, data: null }
  },
  validateLicense: async (_key: string): Promise<IPCResponse<boolean>> => {
    return { success: true, data: true }
  },
  exportPDF: async (_data: unknown): Promise<IPCResponse> => {
    return { success: true }
  },
  exportReport: async (_payload: unknown): Promise<IPCResponse> => {
    return { success: true }
  },
  exportWebReport: async (
    _widgets: unknown[],
    _config: unknown
  ): Promise<IPCResponse> => {
    return { success: true }
  },
  resetDB: async (): Promise<IPCResponse> => {
    return { success: true }
  },
  resetApp: async (): Promise<IPCResponse> => {
    return { success: true }
  },
  saveImage: async (_dataUrl: string, _name?: string): Promise<IPCResponse> => {
    return { success: true }
  },
  saveFile: async (
    _content: string,
    _extension: string,
    _name: string
  ): Promise<IPCResponse<boolean>> => {
    return { success: true, data: true }
  },
  openExternal: async (_url: string): Promise<IPCResponse> => {
    return { success: true }
  },
  setLanguage: async (_lang: 'en' | 'zh'): Promise<IPCResponse> => {
    return { success: true }
  },
  getUserInfo: async (): Promise<IPCResponse<{ username: string }>> => {
    return { success: true, data: { username: 'Guest' } }
  },
  getPath: async (_name: string): Promise<IPCResponse<string>> => {
    return { success: true, data: '/mock/path' }
  },
  getAppVersion: async (): Promise<IPCResponse<string>> => {
    return { success: true, data: '0.3.2' }
  },
  getPathForFile: (file: File) => file.name, // Mock
  windowControl: (
    _action: 'enter-fullscreen' | 'exit-fullscreen' | 'toggle-maximize'
  ) => {
    console.log('Mock windowControl', _action)
  },
  platform: 'darwin',
  version: { node: 'mock', chrome: 'mock', electron: 'mock' } as any,
  onWindowStateChanged: () => () => {},
  onFileProgress: () => () => {},
  onCommandCloseProject: () => () => {},
  onParseProgress: () => () => {},
  onRemoteConfig: () => () => {},
}

function getIpc() {
  if (window.electronAPI) {
    return window.electronAPI
  } else if (import.meta.env.DEV) {
    return mockIPC
  }
  throw new Error('Electron API not available')
}

export function useRunSQL() {
  return useMutation({
    mutationFn: async (sql: string) => {
      const response = await getIpc().runSQL(sql)
      if (!response.success) {
        throw new Error(response.error || 'SQL execution failed')
      }
      return response.data
    },
  })
}

export function useGetSchema() {
  return useQuery({
    queryKey: ['schema'],
    queryFn: async () => {
      const response = await getIpc().getSchema()
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch schema')
      }
      return response.data
    },
  })
}

export function useDeleteTable() {
  return useMutation({
    mutationFn: async (tableName: string) => {
      const response = await getIpc().deleteTable(tableName)
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete table')
      }
      return response.data
    },
  })
}

export function useGenerateSQL() {
  return useMutation({
    mutationFn: async ({
      prompt,
      schema,
    }: {
      prompt: string
      schema: TableSchema[]
    }) => {
      const response = await getIpc().generateSQL(prompt, schema)
      if (!response.success) {
        throw new Error(response.error || 'Failed to generate SQL')
      }
      return response.data
    },
  })
}

export function useAIConfig() {
  return useQuery({
    queryKey: ['ai-config'],
    queryFn: async () => {
      const response = await getIpc().getAIConfig()
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch AI config')
      }
      return response.data
    },
  })
}

export function useSetAIConfig() {
  return useMutation({
    mutationFn: async (config: AIConfig) => {
      const response = await getIpc().setAIConfig(config)
      if (!response.success) {
        throw new Error(response.error || 'Failed to set AI config')
      }
      return response.data
    },
  })
}

export function useParseFile() {
  return useMutation({
    mutationFn: async (filePath: string) => {
      const response = await getIpc().parseFile(filePath)
      if (!response.success) {
        throw new Error(response.error || 'Failed to parse file')
      }
      return response.data
    },
  })
}

export function useSelectFiles() {
  return useMutation({
    mutationFn: async () => {
      const response = await getIpc().selectFiles()
      if (!response.success) {
        throw new Error(response.error || 'Failed to select files')
      }
      return response.data
    },
  })
}

export function useUserInfo() {
  return useQuery({
    queryKey: ['user-info'],
    queryFn: async () => {
      const response = await getIpc().getUserInfo()
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch user info')
      }
      return response.data
    },
  })
}

export function usePlatform() {
  return getIpc().platform
}

export function useExportWebReport() {
  return useMutation({
    mutationFn: async ({
      widgets,
      config,
    }: {
      widgets: unknown[]
      config: unknown
    }) => {
      const response = await getIpc().exportWebReport(widgets, config)
      if (!response.success) {
        throw new Error(response.error || 'Failed to export web report')
      }
      return response.data
    },
  })
}

export function useReIngestFile() {
  return useMutation({
    mutationFn: async ({
      fileId,
      filePath,
      tableName,
      sheetName,
      columns,
    }: {
      fileId: string
      filePath: string
      tableName: string
      sheetName?: string
      columns?: ColumnSchema[]
    }) => {
      const response = await getIpc().reIngestFile(
        fileId,
        filePath,
        tableName,
        sheetName,
        columns
      )
      if (!response.success) {
        throw new Error(response.error || 'Failed to re-ingest file')
      }
      return response.data
    },
  })
}

export function useContextAnalysis() {
  return useMutation({
    mutationFn: async ({
      schemas,
      language,
    }: {
      schemas: TableSchema[]
      language?: 'en' | 'zh'
    }) => {
      const response = await getIpc().analyzeContext(schemas, language)
      if (!response.success) {
        throw new Error(response.error || 'Failed to analyze context')
      }
      return response.data
    },
  })
}

export function useCheckFilesConsistency() {
  return useMutation({
    mutationFn: async (files: FileNode[]) => {
      const response = await getIpc().checkFilesConsistency(files)
      if (!response.success) {
        throw new Error(response.error || 'Failed to check consistency')
      }
      return response.data
    },
  })
}
