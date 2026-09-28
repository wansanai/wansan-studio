import { ElectronAPI } from '../shared/electron-api'

// Vite 环境变量类型
/// <reference types="vite/client" />

// Vite 定义的全局变量
declare const __IS_DEV__: boolean
declare const __APP_VERSION__: string

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// 数据库相关类型
export interface DatabaseSchema {
  tableName: string
  columns: DatabaseColumn[]
}

export interface DatabaseColumn {
  name: string
  type: string
  nullable: boolean
}

// 文件解析结果类型
export interface ParseFileResult {
  tableName: string
  schema: DatabaseSchema
  rowCount: number
  preview: unknown[][]
}

// IPC 响应类型
export interface IPCResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// AI 相关类型
export interface GenerateSQLRequest {
  prompt: string
  schema: DatabaseSchema
}

// 应用状态类型
export interface AppState {
  currentTable: string | null
  isLoading: boolean
  error: string | null
}

// 查询历史类型
export interface QueryHistory {
  id: string
  timestamp: Date
  query: string
  type: 'natural' | 'sql'
  result?: unknown[]
  error?: string
}
