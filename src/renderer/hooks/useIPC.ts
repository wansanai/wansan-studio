import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ElectronAPI } from '@shared/electron-api'
import type {
  AIConfig,
  ColumnSchema,
  InsightResult,
  TableSchema,
} from '@shared/types'
import { InsightGenerationContext } from '@shared/types/dashboard.ts'

function getIpc() {
  if (window.electronAPI) {
    return window.electronAPI
  }
  throw new Error('Electron API not available')
}

/**
 * A helper hook for simple IPC queries
 */
type IpcMethod = keyof ElectronAPI
type IpcArgs = readonly unknown[]
type IpcResult<T> = { success: boolean; data?: T; error?: string }

function useIPC<T>(method: IpcMethod, args: IpcArgs) {
  return useQuery({
    queryKey: [method, ...args],
    queryFn: async () => {
      const fn = getIpc()[method] as (...callArgs: IpcArgs) => Promise<IpcResult<T>>
      const response = await fn(...args)
      if (!response.success) {
        throw new Error(response.error || `IPC error in ${method}`)
      }
      return response.data as T
    },
  })
}

export function useRunSQL() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sql: string) => {
      const response = await getIpc().runSQL(sql)
      if (!response.success) {
        throw new Error(response.error || 'SQL execution failed')
      }
      return response.data
    },
    // If SQL modifies schema (e.g. CREATE/DROP), invalidate schema cache
    onSuccess: (_, sql) => {
      const upper = sql.toUpperCase()
      if (upper.includes('CREATE') || upper.includes('DROP') || upper.includes('ALTER')) {
        queryClient.invalidateQueries({ queryKey: ['getSchema'] })
      }
    }
  })
}

export function useGetSchema() {
  return useQuery({
    queryKey: ['getSchema'],
    queryFn: async () => {
      const response = await getIpc().getSchema()
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch schema')
      }
      return response.data
    },
    staleTime: 30000, // Metadata can stay fresh for 30s
  })
}

export function useDeleteTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tableName: string) => {
      const response = await getIpc().deleteTable(tableName)
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete table')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['getSchema'] })
    }
  })
}

export function useGenerateSQL() {
  return useMutation({
    mutationFn: async (params: {
      prompt: string
      schema: TableSchema[]
    }) => {
      const response = await getIpc().generateSQL(params)
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
    mutationFn: async (params: {
      widgets: unknown[]
      config: { title: string; theme: string; language?: 'en' | 'zh' }
      fullSnapshot?: unknown
    }) => {
      const response = await getIpc().exportWebReport(params)
      if (!response.success) {
        throw new Error(response.error || 'Failed to export web report')
      }
      return (response as { filePath?: string }).filePath
    },
  })
}

export function useReIngestFile() {
  return useMutation({
    mutationFn: async (params: {
      fileId: string
      filePath: string
      tableName: string
      sheetName?: string
      columns?: ColumnSchema[]
      readOptions?: Record<string, unknown>
    }) => {
      const response = await getIpc().reIngestFile(params)
      if (!response.success) {
        throw new Error(response.error || 'Failed to re-ingest file')
      }
      return response.data
    },
  })
}

export function useContextAnalysis() {
  return useMutation({
    mutationFn: async (params: {
      schemas: TableSchema[]
      language?: 'en' | 'zh'
    }) => {
      const response = await getIpc().analyzeContext(params)
      if (!response.success) {
        throw new Error(response.error || 'Failed to analyze context')
      }
      return response.data
    },
  })
}

export function useGetAppVersion() {
  return useIPC('getAppVersion', [])
}

export function useGetMainLogs() {
  return useIPC('getMainLogs', [])
}

export function useGenerateInsight() {
  return useMutation({
    mutationFn: async (
      context: InsightGenerationContext
    ): Promise<InsightResult> => {
      const response = await getIpc().generateInsight(context)
      if (!response.success) {
        throw new Error(response.error || 'Failed to generate insight')
      }
      // Handle legacy string response fallback
      if (typeof response.data === 'string') {
        return {
          summary: 'Analysis',
          findings: [{ id: '0', markdown: response.data }],
        }
      }
      return response.data as InsightResult
    },
  })
}
