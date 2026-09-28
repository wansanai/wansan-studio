import {
  AppConfig,
} from './types'
import { IPCContract } from './ipc-contract'

export * from './types/ipc-params'

/**
 * Derives method names from IPCContract keys by stripping the domain prefix.
 * e.g., 'ai.askAI' -> 'askAI', 'project.projectCreate' -> 'projectCreate'
 */
type StripDomain<S extends string> = S extends `${string}${'.' | ':'}${infer Rest}`
  ? StripDomain<Rest>
  : S

type MethodName<K extends keyof IPCContract> = StripDomain<K & string>

/**
 * Standard Invoke-based methods derived from IPCContract.
 * Handles optional parameters (void or undefined).
 */
type DerivedInvokeMethods = {
  [K in keyof IPCContract as MethodName<K>]: IPCContract[K]['params'] extends void
    ? () => Promise<IPCContract[K]['return']>
    : undefined extends IPCContract[K]['params']
      ? (params?: IPCContract[K]['params']) => Promise<IPCContract[K]['return']>
      : (params: IPCContract[K]['params']) => Promise<IPCContract[K]['return']>
}

/**
 * The unified ElectronAPI exposed to the Renderer process.
 */
export interface ElectronAPI extends DerivedInvokeMethods {
  // Generic invoke (keep for flexibility, but usage should be minimized)
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>

  // Properties & Environment
  platform: string
  version: NodeJS.ProcessVersions

  // Helper Methods (Non-IPC or complex logic)
  getPathForFile: (file: File) => string

  // Window Control & Events (Non-invoke pattern)
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
  onBatchProgress: (
    callback: (data: {
      tableName: string
      columnName: string
      targetColumnName: string
      total: number
      processed: number
      percentage: number
    }) => void
  ) => () => void
  onBatchComplete: (
    callback: (data: {
      tableName: string
      columnName: string
      targetColumnName: string
    }) => void
  ) => () => void
}
