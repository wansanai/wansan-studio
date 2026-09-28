import React, { useEffect, useState } from 'react'
import { useWizardStore } from '@/stores/useWizardStore'
import { Button } from '../../ui/button'
import {
  AlertCircle,
  Check,
  Database,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import { ColumnConfig, IngestionTask } from '@shared/types/wizard'
import { normalizeDuckDBType } from '@shared/type-utils'
import { DatabaseSelectorDialog } from './DatabaseSelectorDialog'
import { useToastStore } from '@/stores/useToastStore'
import { useSettingsStore } from '@/stores/useSettingsStore'


type SyncedColumn = {
  name: string
  type: string
  isPrimaryKey?: boolean
  description?: string
}

type SyncResultData = {
  rowCount: number
  columns: SyncedColumn[]
}

type PrepareResultData = {
  tempFilePath: string
  rowCount: number
  columns: SyncedColumn[]
  preview: unknown[]
  readOptions?: Record<string, unknown>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

export function FileSelectionStep() {
  const { mode, setTasks, tasks, setDbSelectorOpen } = useWizardStore()
  const { t } = useTranslation('common')

  // Database connector is only available in 'import' mode for v1.6
  const isDBAvailable = mode === 'import'

  // --- Logic for File Parsing ---
  const [isParsing, setIsParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const syncTask = async (task: IngestionTask) => {
    // 1. Mark as syncing immediately
    const currentTasks = useWizardStore.getState().tasks
    const taskIndex = currentTasks.findIndex(t => t.id === task.id)
    if (taskIndex === -1) return

    useWizardStore
      .getState()
      .updateTask(taskIndex, { status: 'syncing', error: undefined })

    try {
      const { dbConnections } = useSettingsStore.getState()
      let resultData: SyncResultData | PrepareResultData

      if (task.connectionId) {
        const conn = dbConnections.find(c => c.id === task.connectionId)
        if (!conn) throw new Error('Connection not found')

        const res = await window.electronAPI.syncDBTable({ config: conn, tableName: task.sourceName })

        if (!res.success || !res.data)
          throw new Error(res.error || `Failed to sync ${task.sourceName}`)
        resultData = res.data
      } else {
        const res = await window.electronAPI.prepareFile({
          filePath: task.filePath,
          sourceName: task.sourceName,
          readOptions: task.readOptions
        })
        if (!res.success || !res.data)
          throw new Error(res.error || `Failed to prepare ${task.sourceName}`)
        resultData = res.data
      }

      const tempFilePath =
        'tempFilePath' in resultData ? resultData.tempFilePath : undefined
      const rowCount = resultData.rowCount
      const columns = resultData.columns
      const preview = 'preview' in resultData ? resultData.preview : []
      const readOptions =
        'readOptions' in resultData ? resultData.readOptions : task.readOptions

      // Final Check: Is task still there?
      const latestTasks = useWizardStore.getState().tasks
      const currentIndex = latestTasks.findIndex(t => t.id === task.id)
      if (currentIndex === -1) {
        if (tempFilePath && tempFilePath !== task.filePath) {
          window.electronAPI.cleanupIngestion({ tempTableNames: [], tempFilePaths: [tempFilePath] })
        }
        return
      }

      let finalTableName = task.finalTableName
      if (!finalTableName) {
        if (task.connectionId) {
          // Use the hint we generated above
          const cleanName = (s: string) =>
            s
              .toLowerCase()
              .replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '_')
              .replace(/^_+|_+$/g, '')
          const sourceParts = task.sourceName.split('.')
          const tablePart =
            sourceParts.length > 1
              ? sourceParts.slice(1).join('_')
              : sourceParts[0]
          const schemaPart = sourceParts.length > 1 ? sourceParts[0] : ''

          let baseName = `t_${cleanName(tablePart)}`
          if (
            schemaPart &&
            schemaPart !== 'public' &&
            schemaPart !== 'default'
          ) {
            baseName = `t_${cleanName(schemaPart)}_${cleanName(tablePart)}`
          }
          // Ensure uniqueness
          const uniqueRes =
            await window.electronAPI.getUniqueTableName({ name: baseName })
          finalTableName = uniqueRes.success ? uniqueRes.data : baseName
        } else {
          // For files, clean the display name
          const baseName = task.finalDisplayName || task.fileName
          const uniqueRes = await window.electronAPI.getUniqueTableName({
            name: baseName,
            sheetName: task.sourceName === task.fileName ? undefined : task.sourceName
          })
          finalTableName = uniqueRes.success
            ? uniqueRes.data
            : `t_${Date.now()}`
        }
      }

      useWizardStore.getState().updateTask(currentIndex, {
        status: 'ready',
        // filePath: tempFilePath, // FIX: Do not overwrite original path
        tempFilePath: tempFilePath,
        finalTableName: finalTableName, // Use simplified name
        tableName: finalTableName, // Sync temp table name for consistency if possible, or keep separate?
        // Actually tableName is used for preview queries. If we synced DB to hintTableName, we should use it.
        columns: columns
          .filter((column) => column.name !== '_ws_row_id')
          .map((column): ColumnConfig => ({
            name: column.name,
            type: normalizeDuckDBType(column.type),
            isPrimaryKey: column.isPrimaryKey || false,
            description: column.description,
          })),
        previewData: preview || [],
        rowCount: rowCount,
        readOptions: readOptions || task.readOptions,
      })
    } catch (e: unknown) {
      console.error('[Wizard] Task preparation failed:', e)
      const latestTasks = useWizardStore.getState().tasks
      const currentIndex = latestTasks.findIndex(t => t.id === task.id)
      if (currentIndex !== -1) {
        useWizardStore.getState().updateTask(currentIndex, {
          status: 'error',
          error: getErrorMessage(e) || 'Synchronization failed',
        })
      }
    }
  }

  // Auto-Preloading Effect
  useEffect(() => {
    const pendingTasks = tasks.filter(t => t.status === 'waiting_for_sync')
    if (pendingTasks.length === 0) return

    pendingTasks.forEach(task => {
      syncTask(task)
    })
  }, [tasks])

  const handleSelectFiles = async () => {
    if (!window.electronAPI) return

    if (mode !== 'import') {
      const result = await window.electronAPI.selectFile()
      if (result.success && result.data) {
        parseFiles([
          {
            path: result.data,
            name: result.data.split(/[\\/]/).pop() || 'unknown',
          },
        ])
      }
    } else {
      const result = await window.electronAPI.selectFiles()
      if (result.success && result.data && result.data.length > 0) {
        parseFiles(
          result.data.map(f => ({
            path: f.path,
            name: f.path.split(/[\\/]/).pop() || 'unknown',
            size: f.size,
          }))
        )
      }
    }
  }

  const parseFiles = async (files: { path: string; name: string }[]) => {
    setIsParsing(true)
    setError(null)
    try {
      const newTasks: IngestionTask[] = []

      for (const file of files) {
        const res = await window.electronAPI.inspectFile(file.path)
        if (!res.success || !res.data) {
          throw new Error(res.error || `Failed to inspect ${file.name}`)
        }

        const fileTasks = res.data.map((item: { sourceName: string; previewHeaders?: string[]; readOptions?: Record<string, unknown> }) => {
          // [Stage 1] No columns yet. They will be populated in Stage 2 (Prepare).
          const columns: ColumnConfig[] = []

          const displayName =
            item.sourceName && item.sourceName !== file.name
              ? `${file.name.replace(/\.[^/.]+$/, '')} - ${item.sourceName}`
              : item.sourceName || file.name.replace(/\.[^/.]+$/, '')

          return {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            fileName: file.name,
            filePath: file.path, // Internal wizard state
            sourceName: item.sourceName,
            finalDisplayName: displayName,
            status: 'waiting_for_sync',
            columns,
            previewData: [],
            rowCount: 0,
            tableName: `temp_ingest_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          } as IngestionTask
        })

        newTasks.push(...fileTasks)
      }

      if (mode !== 'import') {
        // Replace existing tasks with all sheets from the newly selected file
        setTasks(newTasks)
      } else {
        // De-duplication
        const uniqueNewTasks = newTasks.filter(
          newTask =>
            !tasks.some(
              existingTask =>
                existingTask.filePath === newTask.filePath &&
                existingTask.sourceName === newTask.sourceName
            )
        )

        const skippedCount = newTasks.length - uniqueNewTasks.length

        if (uniqueNewTasks.length > 0) {
          setTasks([...tasks, ...uniqueNewTasks])
        }

        if (skippedCount > 0) {
          useToastStore.getState().addToast({
            title: t('wizard.files_skipped', { count: skippedCount }),
            type: 'info',
          })
        }
      }
    } catch (err: unknown) {
      console.error('[Wizard] File inspection failed:', err)
      setError(getErrorMessage(err) || 'Failed to parse files')
    } finally {
      setIsParsing(false)
    }
  }

  const handleRemoveTask = (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (task?.tempFilePath && task.tempFilePath !== task.filePath) {
      // Clean up temp file
      window.electronAPI.cleanupIngestion({ tempTableNames: [], tempFilePaths: [task.tempFilePath] })
    }
    setTasks(tasks.filter(t => t.id !== id))
  }

  function renderEmptyState() {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-8 border-4 border-white shadow-xl">
          <Upload className="w-10 h-10 text-indigo-600" />
        </div>

        <h3 className="text-2xl font-bold text-zinc-900 mb-3 tracking-tight">
          {t('wizard.select_title')}
        </h3>
        <p className="text-zinc-500 max-w-md mb-10 leading-relaxed">
          {t('wizard.select_desc')}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={handleSelectFiles}
            disabled={isParsing}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl px-10 h-14 font-bold text-lg shadow-lg shadow-indigo-100 hover:scale-105 transition-all active:scale-95"
          >
            {isParsing ? (
              <Loader2 className="w-6 h-6 animate-spin mr-3" />
            ) : (
              <Plus className="w-6 h-6 mr-3" />
            )}
            {t('wizard.select_files')}
          </Button>

          {isDBAvailable && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setDbSelectorOpen(true)}
              className="rounded-2xl px-10 h-14 font-bold text-lg border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 transition-all"
            >
              <Database className="w-6 h-6 mr-3 text-pink-500" />
              {t('wizard.connect_db')}
            </Button>
          )}
        </div>

        <div className="mt-12 flex items-center gap-8 opacity-40 grayscale group hover:grayscale-0 transition-all duration-500">
          <FileSpreadsheet className="w-8 h-8" />
          <FileText className="w-8 h-8" />
          <Layers className="w-8 h-8" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <DatabaseSelectorDialog />

      {tasks.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-500">
          <div className="px-12 py-8 flex justify-between items-center bg-zinc-50/50 border-b border-zinc-100">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">
                {t('wizard.tasks_title', 'Data Sources')}
              </h3>
              {mode !== 'import' && tasks.length > 1 ? (
                <p className="text-xs text-rose-500 mt-1 font-bold animate-pulse">
                  {t(
                    'wizard.select_only_one_sheet',
                    'Please keep only one sheet. Only one data source is allowed for this mode.'
                  )}
                </p>
              ) : (
                <p className="text-xs text-zinc-500 mt-1">
                  {t(
                    'wizard.tasks_desc',
                    'Confirm the files or tables you want to ingest.'
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {(mode === 'import' || tasks.length === 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectFiles}
                  disabled={isParsing}
                  className="rounded-xl border-zinc-200 font-bold h-10 px-4"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('wizard.add_more')}
                </Button>
              )}
              {isDBAvailable && (mode === 'import' || tasks.length === 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDbSelectorOpen(true)}
                  className="rounded-xl border-zinc-200 font-bold h-10 px-4"
                >
                  <Database className="w-4 h-4 mr-2 text-pink-500" />
                  {t('wizard.add_db')}
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-12 bg-white">
            <div className="max-w-4xl mx-auto space-y-4">
              {tasks.map(task => (
                <div
                  key={task.id}
                  className="group bg-white border border-zinc-200 p-4 rounded-xl flex items-center gap-4 hover:border-indigo-300 transition-all shadow-sm"
                >
                  <div
                    className={cn(
                      'p-2.5 rounded-lg shrink-0',
                      task.connectionId
                        ? 'bg-pink-50 text-pink-600'
                        : task.fileName.endsWith('.parquet')
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-blue-50 text-blue-600'
                    )}
                  >
                    {task.connectionId ? (
                      <Database className="w-5 h-5" />
                    ) : task.fileName.endsWith('.parquet') ? (
                      <Layers className="w-5 h-5" />
                    ) : (
                      <FileText className="w-5 h-5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-900 truncate">
                        {task.sourceName}
                      </span>

                      {task.status === 'waiting_for_sync' && (
                        <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                          {t('wizard.status_pending', 'Pending')}
                        </span>
                      )}
                      {task.status === 'syncing' && (
                        <span className="flex items-center gap-1 text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />{' '}
                          {t('wizard.status_preparing', 'Preparing')}
                        </span>
                      )}
                      {task.status === 'ready' && (
                        <span className="flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                          <Check className="w-2.5 h-2.5" />{' '}
                          {t('wizard.status_ready', 'Ready')}
                        </span>
                      )}
                      {task.status === 'error' && (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider truncate max-w-[150px]"
                            title={task.error}
                          >
                            {t('wizard.status_error', 'Error')}
                          </span>
                          <button
                            onClick={() => syncTask(task)}
                            className="p-1 hover:bg-zinc-100 rounded-md text-zinc-400 hover:text-indigo-600 transition-colors"
                            title="Retry"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">
                      {task.fileName}
                    </p>
                  </div>

                  {task.status === 'ready' && (
                    <div className="text-right shrink-0 animate-in fade-in slide-in-from-right-1">
                      <p className="text-[10px] font-mono font-black text-zinc-500 uppercase leading-tight">
                        {task.rowCount.toLocaleString()} Rows
                      </p>
                      <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter mt-0.5">
                        {task.columns.length} Columns
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => handleRemoveTask(task.id)}
                    className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-4 right-4 bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 text-red-600 text-sm font-bold animate-in slide-in-from-bottom-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  )
}
