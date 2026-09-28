import { useCallback, useEffect, useRef, useState } from 'react'
import { isDev } from '../utils/env'
import i18n from '../i18n'
import { useProjectStore } from '../stores/useProjectStore'
import { useChatStore } from '../stores/useChatStore'
import { useWorkbenchStore } from '../stores/useWorkbenchStore'
import { useUIStore } from '../stores/useUIStore'
import {
  useSettingsStore,
  SETTINGS_STORAGE_KEY,
} from '../stores/useSettingsStore'
import { useTranslation } from 'react-i18next'
import legacyData from '@shared/legacy-data.ts'
import type { GetSchemaResponse } from '@shared/api-types'

interface LogEntry {
  id: number
  type: 'log' | 'warn' | 'error' | 'info'
  message: string
  source?: string
  timestamp: Date
}

interface DevConsoleProps {
  defaultOpen?: boolean
}

// 生产环境不渲染
export function DevConsole({ defaultOpen = false }: DevConsoleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [isMinimized, setIsMinimized] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [activeTab, setActiveTab] = useState<'console' | 'tools'>('console')
  const [language, setLanguage] = useState(i18n.language || 'en')
  const logIdRef = useRef(0)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation('common')

  // 拦截 console 方法
  useEffect(() => {
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    }

    const createLogger =
      (type: LogEntry['type']) =>
      (...args: unknown[]) => {
        // 1. 提取原始位置
        const stack = new Error().stack?.split('\n') || []
        // stack[0] 是 "Error"
        // stack[1] 是 createLogger 的内部匿名函数
        // stack[2] 是调用 console.xxx 的地方
        const traceLine = stack[2] || ''
        const sourceMatch = traceLine.match(/at\s+(.*)$/) || [null, 'unknown']
        const fullSource = sourceMatch[1] || 'unknown'
        // 简化路径，只保留文件名和行号
        const source = fullSource.split('/').pop()?.replace(')', '')

        // 2. 原生打印 (带上原始位置提示)
        // 使用 %c 样式让位置信息不那么扎眼
        originalConsole[type](...args, `\n  ↳ @ ${source}`)

        // 3. 构造 UI 日志
        const message = args
          .map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          )
          .join(' ')

        setLogs(prev => [
          ...prev.slice(-99),
          {
            id: ++logIdRef.current,
            type,
            message,
            source,
            timestamp: new Date(),
          },
        ])
      }

    console.log = createLogger('log')
    console.warn = createLogger('warn')
    console.error = createLogger('error')
    console.info = createLogger('info')

    return () => {
      console.log = originalConsole.log
      console.warn = originalConsole.warn
      console.error = originalConsole.error
      console.info = originalConsole.info
    }
  }, [])

  // 自动滚动到最新日志
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const clearLogs = useCallback(() => setLogs([]), [])

  const resetApp = useCallback(async () => {
    if (!confirm(t('reset_confirm'))) return

    console.log(`💥 ${t('reset_nuking')}`)

    try {
      if (window.electronAPI) {
        console.log('🧹 Clearing Backend State (DuckDB, Config, Stores)...')
        await window.electronAPI.resetApp()
      }
    } catch (e) {
      console.error('Failed to reset backend:', e)
    }

    // 1. Clear LocalStorage completely for Wansan
    const keysToRemove = [
      'wansan-files',
      'wansan-chat',
      'wansan-workbench',
      'wansan-project-v2',
      'wansan-ui-state',
      'wansan-migration-v1.3',
      SETTINGS_STORAGE_KEY,
    ]
    keysToRemove.forEach(key => localStorage.removeItem(key))

    // 2. Reset Zustand Stores (Memory)
    useProjectStore.getState().reset()
    useChatStore.getState().reset()
    useWorkbenchStore.getState().reset()
    useUIStore.getState().resetLayout()
    // Explicitly reset everything in settings for DevConsole reset
    const settingsStore = useSettingsStore.getState()
    settingsStore.updateSettings({
      isActivated: false,
      recentProjectPaths: [],
      hasCompletedOnboarding: false,
      apiKey: '',
    })
    settingsStore.resetPreferences()
    window.location.reload()
  }, [t])

  const injectLegacyData = useCallback(() => {
    if (
      !confirm(
        'This will OVERWRITE your current LocalStorage with v1.2 legacy mock data. Continue?'
      )
    )
      return

    console.log('💉 Injecting Legacy Data...')

    // 1. Mock Legacy Formats
    const legacyProject = legacyData

    // Use a dedicated key to prevent the current store from wiping 'relations' on hydration
    localStorage.setItem(
      'wansan-project-v2-legacy-mock',
      JSON.stringify(legacyProject)
    )
    // Also set the main key for files discovery, but we will rely on the mock key for actual migration
    localStorage.setItem('wansan-project-v2', JSON.stringify(legacyProject))

    // 2. Clear Migration Flag
    localStorage.removeItem('wansan-migration-v1.3')

    // 3. Mock Settings (Legacy Version 2)
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        state: {
          language: 'en',
          hasCompletedOnboarding: true,
          isActivated: true, // Legacy activated state
        },
        version: 2, // Simulate older version to trigger migrate()
      })
    )

    console.log('✅ Legacy Data Injected. Reloading...')
    window.location.reload()
  }, [])

  const simulateEnterpriseMode = useCallback(() => {
    console.log('🏢 Simulating Enterprise Mode...')
    useSettingsStore.getState().setRemoteConfig({
      channel: 'EXE',
      special_expiry: '2026-12-31',
      isActivated: true,
      isSpecialChannel: true,
    })
  }, [])

  const simulateExpiredMode = useCallback(() => {
    console.log('⏰ Simulating Expired Mode...')
    useSettingsStore.getState().setRemoteConfig({
      channel: 'EXE',
      special_expiry: '2020-01-01',
      isActivated: false,
      isSpecialChannel: true,
      isExpired: true,
    })
  }, [])

  const injectMockBetaCode = useCallback(() => {
    console.log('🔑 Injecting Mock Beta Code (TEST-123)...')
    const currentConfig = useSettingsStore.getState().remoteConfig
    useSettingsStore.getState().setRemoteConfig({
      ...currentConfig,
      beta_code: ['TEST-123', 'WANSAN-BETA'],
    })
  }, [])

  const printAllTables = useCallback(async () => {
    try {
      const result = (await window.electronAPI.getSchema()) as GetSchemaResponse
      console.log('📊 Fetching all tables from DuckDB...', result)

      if (result.success && result.data && Array.isArray(result.data.tables)) {
        const tables = result.data.tables
        console.log(`✅ Found ${tables.length} table(s):`)

        // 以对象形式打印，方便在控制台折叠查看
        const tableSummary = tables.reduce<Record<string, { description: string; columnCount: number; columns: Array<{ name: string; type: string }> }>>((acc, table) => {
          acc[table.tableName || 'unnamed'] = {
            description: table.description || 'N/A',
            columnCount: table.columns?.length || 0,
            columns: (table.columns || []).map((col) => ({
              name: col.name,
              type: col.type || 'unknown',
            })),
          }
          return acc
        }, {})

        console.log(tableSummary)
      } else {
        console.warn('No tables found or invalid response:', result)
      }
    } catch (error) {
      console.error('❌ Failed to fetch tables:', error)
    }
  }, [])

  const printFileNodes = useCallback(() => {
    const files = useProjectStore.getState().files
    console.log('📂 Current Project FileNodes:', files)
  }, [])

  useEffect(() => {
    const handleLanguageChange = (lng: string) => setLanguage(lng)
    i18n.on('languageChanged', handleLanguageChange)
    return () => {
      i18n.off('languageChanged', handleLanguageChange)
    }
  }, [])

  const handleLanguageSwitch = async (lng: string) => {
    if (lng === language) return
    await i18n.changeLanguage(lng)
  }

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'error':
        return 'text-red-600 bg-red-50'
      case 'warn':
        return 'text-yellow-600 bg-yellow-50'
      case 'info':
        return 'text-blue-600 bg-blue-50'
      default:
        return 'text-gray-700'
    }
  }

  // Moved check here to respect Rules of Hooks
  if (!isDev) return null

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-4 z-[200] px-3 py-2 bg-gray-800 text-white rounded-lg shadow-lg hover:bg-gray-700 text-sm font-mono"
      >
        🛠️ Dev Console
      </button>
    )
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-[200] px-3 py-2 bg-gray-800 text-white rounded-lg shadow-lg hover:bg-gray-700 text-sm font-mono"
      >
        🛠️ Dev Console
      </button>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] bg-gray-900 text-white shadow-2xl border-t border-gray-700">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm font-semibold">
            🛠️ Dev Console
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('console')}
              className={`px-3 py-1 text-xs rounded ${activeTab === 'console' ? 'bg-gray-600' : 'hover:bg-gray-700'}`}
            >
              Console
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className={`px-3 py-1 text-xs rounded ${activeTab === 'tools' ? 'bg-gray-600' : 'hover:bg-gray-700'}`}
            >
              Tools
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearLogs}
            className="px-2 py-1 text-xs hover:bg-gray-700 rounded"
          >
            🗑️ Clear
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="px-2 py-1 text-xs hover:bg-gray-700 rounded"
          >
            ➖
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="px-2 py-1 text-xs hover:bg-gray-700 rounded"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="h-48 overflow-hidden">
        {activeTab === 'console' ? (
          <div className="h-full overflow-y-auto p-2 font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-4">
                No logs yet...
              </div>
            ) : (
              logs.map(log => (
                <div
                  key={log.id}
                  className={`px-2 py-1 rounded ${getLogColor(log.type)} group/log`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      [{log.timestamp.toLocaleTimeString()}]
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-tight opacity-70">
                      {log.type}
                    </span>
                    {log.source && (
                      <span className="text-[10px] text-zinc-400 font-mono italic ml-auto opacity-0 group-hover/log:opacity-100 transition-opacity">
                        @ {log.source}
                      </span>
                    )}
                  </div>
                  <span className="whitespace-pre-wrap break-all leading-relaxed">
                    {log.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        ) : (
          <div className="h-full p-4">
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={() => console.log('Test log')}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm"
              >
                📝 Test Log
              </button>
              <button
                onClick={() => console.warn('Test warning')}
                className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm"
              >
                ⚠️ Test Warn
              </button>
              <button
                onClick={() => console.error('Test error')}
                className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm"
              >
                ❌ Test Error
              </button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={printAllTables}
                className="px-3 py-2 bg-blue-700 hover:bg-blue-600 rounded text-sm"
              >
                🗄️ Print All Tables
              </button>
              <button
                onClick={printFileNodes}
                className="px-3 py-2 bg-purple-700 hover:bg-purple-600 rounded text-sm"
              >
                📂 Print FileNodes
              </button>
              <button
                onClick={resetApp}
                className="px-3 py-2 bg-red-700 hover:bg-red-600 rounded text-sm"
              >
                ♻️ Reset App State
              </button>
              <button
                onClick={injectLegacyData}
                className="px-3 py-2 bg-orange-700 hover:bg-orange-600 rounded text-sm"
              >
                💉 Inject Legacy Data
              </button>
              <button
                onClick={simulateEnterpriseMode}
                className="px-3 py-2 bg-indigo-700 hover:bg-indigo-600 rounded text-sm"
              >
                🏢 Sim Enterprise
              </button>
              <button
                onClick={simulateExpiredMode}
                className="px-3 py-2 bg-pink-700 hover:bg-pink-600 rounded text-sm"
              >
                ⏰ Sim Expired
              </button>
              <button
                onClick={injectMockBetaCode}
                className="px-3 py-2 bg-teal-700 hover:bg-teal-600 rounded text-sm"
              >
                🔑 Inject BetaCode
              </button>
              <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm">
                <span className="text-gray-400">Language</span>
                <select
                  value={language}
                  onChange={e => handleLanguageSwitch(e.target.value)}
                  className="bg-gray-700 text-white text-sm px-2 py-1 rounded focus:outline-none"
                >
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
