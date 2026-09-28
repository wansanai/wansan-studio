import React, {
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react'
import { CodeEditor } from '../ui/CodeEditor'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  Copy,
  Download,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Sparkles,
  Table,
  Timer,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import { format } from 'sql-formatter'
import { useProGate } from '@/hooks/use-pro-gate'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUIStore } from '@/stores/useUIStore'
import { Button } from '@/components/ui/button'
import { DataTable as ReportTable } from '../viz/base/DataTable'
import { Analytics } from '../../services/analytics'
import { dataToCSV } from '@/utils/export-utils'
import { useToastStore } from '@/stores/useToastStore'

export interface QueryPanelRef {
  runQuery: (bypassGate?: boolean) => Promise<boolean>
}

interface QueryPanelProps {
  sql: string
  onChange: (sql: string) => void
  initialSql: string
  initialData?: Array<Record<string, unknown>>
  reasoning?: string
  className?: string
  runOnMount?: boolean
}


function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Execution failed'
}

function getErrorStack(error: unknown): string {
  return error instanceof Error && error.stack ? error.stack : String(error)
}
export const QueryPanel = forwardRef<QueryPanelRef, QueryPanelProps>(
  (
    {
      sql,
      onChange,
      initialSql,
      initialData = [],
      reasoning,
      className,
      runOnMount = false,
    },
    ref
  ) => {
    const { t } = useTranslation('analysis')
    const [isRunning, setIsRunning] = useState(false)
    const [isMaximized, setIsMaximized] = useState(false)
    const isRestoring = useProjectStore(s => s.isRestoring)
    const [previewData, setPreviewData] = useState<Array<Record<string, unknown>> | null>(
      initialData.length > 0 ? initialData : null
    )
    const [previewColumnFields, setPreviewColumnFields] = useState<
      Array<{ name: string; type: string }>
    >([])
    const [previewError, setPreviewError] = useState<string | null>(null)
    const [execTime, setExecTime] = useState<number | null>(null)
    const [copied, setCopied] = useState(false)
    const [showReasoning, setShowReasoning] = useState(true)
    const { isActivated, checkGate, gateNode } = useProGate()
    const addToast = useToastStore(s => s.addToast)

    const handleRunPreview = async (queryToRun: string, bypassGate = false) => {
      if (isRestoring || !queryToRun.trim()) return false

      let success = false
      const run = async () => {
        setIsRunning(true)
        setPreviewError(null)
        const startTime = performance.now()
        try {
          const res = await window.electronAPI.runSQL(queryToRun)
          if (res.success && res.data) {
            const { data, columnFields } = res.data
            setExecTime(Math.round(performance.now() - startTime))
            setPreviewData(data)
            setPreviewColumnFields(columnFields || [])
            setPreviewError(null)
            success = true // <--- THIS IS THE FIX
          } else {
            throw new Error(res.error)
          }
        } catch (e: unknown) {
          setPreviewError(getErrorMessage(e))
          setPreviewData([])
          setPreviewColumnFields([])
          success = false
        } finally {
          setIsRunning(false)
          Analytics.track('sqllab_executed', {
            status: success ? 'success' : 'error',
            duration: Math.round(performance.now() - startTime),
          })
        }
      }

      if (bypassGate) {
        await run()
      } else {
        await new Promise<void>(resolve => {
          checkGate(t('pro_benefit_sql', { ns: 'common' }), async () => {
            await run()
            resolve()
          })
        })
      }
      return success
    }

    const handleExportCSV = async () => {
      if (!previewData || previewData.length === 0) return

      try {
        const csvContent = dataToCSV(previewData)
        const res = await window.electronAPI.saveFile({
          content: csvContent,
          extension: 'csv',
          name: 'query_result.csv'
        })

        if (res.success && res.data) {
          const filePath = res.data as string
          addToast({
            title: t('export_success', { ns: 'common' }),
            description: filePath,
            type: 'success',
            action: {
              label: t('open_folder', { ns: 'common' }),
              onClick: () => window.electronAPI.showItemInFolder(filePath),
            },
          })
        }
      } catch (e: unknown) {
        useUIStore.getState().showError(
          t('export_failed', { ns: 'common' }),
          t('error_processing_request', { ns: 'chat' }),
          getErrorStack(e)
        )
      }
    }

    useImperativeHandle(ref, () => ({
      runQuery: async (bypassGate = false) => {
        return await handleRunPreview(sql, bypassGate)
      },
    }))

    // Auto-format and run on mount if requested
    const [hasRunOnMount, setHasRunOnMount] = useState(false)
    useEffect(() => {
      if (runOnMount && !isRestoring && !hasRunOnMount) {
        setHasRunOnMount(true)
        let sqlToRun = initialSql
        try {
          const formatted = format(initialSql, {
            language: 'postgresql',
            tabWidth: 2,
            keywordCase: 'upper',
            indentStyle: 'standard',
            logicalOperatorNewline: 'before',
            expressionWidth: 120,
            denseOperators: true,
          })
          // Only update if different to avoid loop if parent updates prop
          if (formatted !== sql) {
            onChange(formatted)
          }
          sqlToRun = formatted
        } catch {
          // Ignore format error
        }
        handleRunPreview(sqlToRun, true)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runOnMount, isRestoring, hasRunOnMount])

    const handleCopy = () => {
      navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    const handleReset = () => {
      onChange(initialSql)
      setPreviewError(null)
      setPreviewData(null)
      setExecTime(null)
    }

    const handleFormat = () => {
      try {
        const formatted = format(sql, {
          language: 'postgresql',
          tabWidth: 2,
          keywordCase: 'upper',
          indentStyle: 'standard',
          logicalOperatorNewline: 'before',
          expressionWidth: 120,
          denseOperators: true,
        })
        onChange(formatted)
      } catch {
        // Ignore formatting errors
      }
    }

    return (
      <div
        className={cn(
          'flex-1 flex flex-col min-h-0 gap-4 overflow-hidden',
          className
        )}
      >
        {gateNode}
        {/* EDITOR AREA */}
        <div
          className={cn(
            'border border-zinc-200 rounded-lg overflow-hidden relative flex flex-col min-h-0 shadow-sm bg-white transition-all duration-300',
            isMaximized ? 'flex-1' : 'h-1/2'
          )}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b bg-zinc-50/80 shrink-0">
            <div className="flex items-center gap-2">
              <Code className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                {t('sql_editor.editor_header')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {reasoning && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-zinc-500 hover:text-zinc-900"
                  onClick={() => setShowReasoning(!showReasoning)}
                >
                  {showReasoning ? (
                    <ChevronUp className="w-3 h-3 mr-1" />
                  ) : (
                    <ChevronDown className="w-3 h-3 mr-1" />
                  )}
                  {showReasoning
                    ? t('sql_editor.hide_logic')
                    : t('sql_editor.show_logic')}
                </Button>
              )}
              <div className="w-px h-3 bg-zinc-200 mx-1" />
              <Button
                onClick={() =>
                  checkGate(
                    t('pro_benefit_sql', { ns: 'common' }),
                    handleFormat
                  )
                }
                variant="ghost"
                size="sm"
                className="h-7 text-xs hover:text-zinc-900 text-zinc-500"
              >
                {!isActivated && <Lock className="w-3 h-3 mr-1" />}
                <Sparkles className="h-3 w-3 mr-1" />
                {t('sql_editor.format')}
              </Button>
              <Button
                onClick={handleCopy}
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-zinc-500 hover:text-zinc-900"
              >
                {copied ? (
                  <Check className="w-3 h-3 mr-1 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3 mr-1" />
                )}
                {copied ? t('sql_editor.copy_success') : t('sql_editor.copy')}
              </Button>
              <Button
                onClick={() =>
                  checkGate(t('pro_benefit_sql', { ns: 'common' }), handleReset)
                }
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 text-xs hover:text-zinc-900',
                  !isActivated ? 'text-amber-600 font-medium' : 'text-zinc-500'
                )}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                {t('sql_editor.reset')}
              </Button>
              <div className="w-px h-4 bg-zinc-200 mx-1" />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-900"
                onClick={() => setIsMaximized(!isMaximized)}
                title={
                  isMaximized
                    ? t('sql_editor.restore', 'Restore')
                    : t('sql_editor.maximize', 'Maximize')
                }
              >
                {isMaximized ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </Button>
              <div className="w-px h-4 bg-zinc-200 mx-1" />
              <Button
                size="sm"
                onClick={() => handleRunPreview(sql)}
                className="h-7 bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-sm px-3"
                disabled={isRunning || isRestoring}
              >
                {isRunning || isRestoring ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3 fill-current" />
                )}
                {t('sql_editor.run')}
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 relative">
            {!isActivated && (
              <div
                className="absolute inset-0 z-10 bg-zinc-100/10 backdrop-blur-[1px] flex items-center justify-center cursor-pointer group/lock"
                onClick={() =>
                  checkGate(t('pro_benefit_sql', { ns: 'common' }), () => {})
                }
              >
                <div className="bg-white/90 shadow-md border border-amber-200 px-4 py-2 rounded-full flex items-center gap-2 text-amber-700 text-sm font-semibold transform transition-transform group-hover/lock:scale-105">
                  <Lock className="w-4 h-4" />
                  {t('unlock_pro', { ns: 'common' })}
                </div>
              </div>
            )}
            <div className="h-full flex flex-col">
              {showReasoning && reasoning && (
                <div className="m-4 mb-2 bg-indigo-50/50 border border-indigo-100 p-3 rounded-lg text-xs text-indigo-900/80 animate-in slide-in-from-top-2 shrink-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-3 w-3 text-indigo-500" />
                    <span className="font-semibold tracking-wide uppercase text-indigo-400">
                      {t('sql_editor.ai_reasoning')}
                    </span>
                  </div>
                  <p className="leading-relaxed whitespace-pre-wrap font-medium italic">
                    {reasoning}
                  </p>
                </div>
              )}
              <CodeEditor
                value={sql}
                onChange={onChange}
                readOnly={!isActivated}
                className="flex-1"
              />
            </div>
          </div>
        </div>

        {/* PREVIEW AREA */}
        {!isMaximized && (
          <div className="h-1/2 min-h-[300px] border border-zinc-200 rounded-lg bg-white flex flex-col min-w-0 shadow-sm">
            <div className="bg-zinc-50/80 px-4 py-2 border-b flex justify-between items-center text-xs shrink-0">
              <div className="flex items-center gap-2 font-bold text-zinc-500 uppercase tracking-wider">
                <Table className="w-3.5 h-3.5" />
                <span>{t('sql_editor.result_preview')}</span>
              </div>

              <div className="flex items-center gap-3 text-zinc-400 font-mono">
                {execTime !== null && (
                  <span className="flex items-center gap-1">
                    <Timer className="w-3 h-3" /> {execTime}ms
                  </span>
                )}
                {previewData && (
                  <>
                    <span className="w-px h-3 bg-zinc-200" />
                    <span>
                      {previewData.length} {t('sql_editor.rows_suffix')}
                    </span>
                    <span>x</span>
                    <span>
                      {Object.keys(previewData[0] || {}).length}{' '}
                      {t('field_name', { ns: 'common' })}
                    </span>
                    <span className="w-px h-3 bg-zinc-200" />
                    <button
                      onClick={handleExportCSV}
                      className="hover:text-zinc-600 transition-colors flex items-center gap-1"
                      title={t('export', { ns: 'common' })}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0">
              {previewError ? (
                <div className="p-4 text-red-600 font-mono text-sm bg-red-50/30 h-full overflow-auto">
                  <div className="flex items-center gap-2 mb-2 font-bold">
                    <X className="w-4 h-4" />
                    ERROR
                  </div>
                  <pre className="whitespace-pre-wrap">{previewError}</pre>
                </div>
              ) : (
                <ReportTable
                  data={previewData || []}
                  columnFields={previewColumnFields}
                  variant="preview"
                />
              )}
            </div>
          </div>
        )}
      </div>
    )
  }
)

QueryPanel.displayName = 'QueryPanel'
