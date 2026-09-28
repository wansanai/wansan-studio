import React, { useState, useCallback, useRef } from 'react'
import {
  Code,
  Download,
  FileSpreadsheet,
  FileText,
  Image,
  Pin,
  RefreshCw,
  SquarePen,
  SlidersHorizontal,
  Sparkles,
  Lightbulb,
} from 'lucide-react'
import { VizRenderer } from '../core/VizRenderer'
import { InsightPanel } from '../InsightPanel'
import {
  ReportData,
  useWorkbenchStore,
} from '../../../stores/useWorkbenchStore'
import { useChatStore } from '@/stores/useChatStore.ts'
import { useProjectStore } from '@/stores/useProjectStore.ts'
import { useUIStore } from '@/stores/useUIStore.ts'
import { useSqlLabStore } from '@/stores/useSqlLabStore.ts'
import { useToastStore } from '@/stores/useToastStore.ts'
import { useSettingsStore } from '@/stores/useSettingsStore.ts'
import { cn } from '@/utils/cn.ts'
import type { ChatMessage } from '../../ChatInterface'
import { useTranslation } from 'react-i18next'
import { ExpandableAction } from '../../ui/expandable-action'
import { useGenerateInsight } from '@/hooks/useIPC'
import { dataToCSV, captureChartInfo, formatInsight } from '@/utils/export-utils'
import { sanitizeFilename } from '@shared/naming-utils'
import { toPng } from 'html-to-image'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface ChatReportCardProps {
  messageId: string
  message: ChatMessage
  reportData: ReportData
  className?: string
  onConfigure?: () => void
}

export const ChatReportCard = React.memo(function ChatReportCard({
  messageId,
  message,
  reportData: fallbackReportData,
  className,
  onConfigure,
}: ChatReportCardProps) {
  const pinReport = useWorkbenchStore(state => state.pinReport)
  const removeReport = useWorkbenchStore(state => state.removeReport)
  const pinnedReports = useWorkbenchStore(state => state.pinnedReports)
  const setEditingReportId = useWorkbenchStore(
    state => state.setEditingReportId
  )
  const setReplyTo = useChatStore(state => state.setReplyTo)
  const updateMessageData = useChatStore(state => state.updateMessageData)
  const updateMessageInsight = useChatStore(state => state.updateMessageInsight)
  const addToast = useToastStore(state => state.addToast)
  const openSqlLab = useSqlLabStore(state => state.open)
  const { t, i18n } = useTranslation(['common', 'chat'])
  const [isRerunning, setIsRerunning] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [manualActive, setManualActive] = useState(false)
  const [triggerCount, setTriggerCount] = useState(0)
  const [highlightedItems, setHighlightedItems] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const generateInsight = useGenerateInsight()
  const language = i18n.language === 'zh' ? 'zh' : 'en'

  // 🔥 从 widgetRegistry 读取最新数据,实现响应式更新
  const widgetRegistry = useProjectStore(state => state.widgetRegistry)
  const reportData =
    message.widgetId && widgetRegistry[message.widgetId]
      ? widgetRegistry[message.widgetId]
      : fallbackReportData

  const handleDrillDown = useCallback(
    (
      action: 'focus' | 'view_data' | 'breakdown',
      payload: { name: string; dimension?: string }
    ) => {
      const { name, dimension } = payload
      const vizConfig = reportData.vizConfig
      const yAxisStr = Array.isArray(vizConfig?.y_axis)
        ? vizConfig.y_axis.join(', ')
        : vizConfig?.y_axis || 'metric'

      if (action === 'focus') {
        const displayMsg = `🔍 ${t('common:focus_analysis', { name })}`
        const hiddenMsg = `Filter the current analysis by ${name}. 
      CRITICAL CONSTRAINTS:
      - Maintain the current visualization metrics (aggregation).
      - DO NOT show raw data rows.
      - Keep the same chart type if possible.`
        setReplyTo(messageId)
        useChatStore.getState().sendMessage(displayMsg, hiddenMsg)
      } else if (action === 'view_data') {
        const displayMsg = `📄 ${t('common:view_raw_data', { name })}`
        const hiddenMsg = `Show the first 100 raw data rows for '${name}'.
        Constraint: Switch viz_type to 'table'.`
        setReplyTo(messageId)
        useChatStore.getState().sendMessage(displayMsg, hiddenMsg)
      } else if (action === 'breakdown' && dimension) {
        const displayMsg = `📊 ${t('common:breakdown_analysis', { dimension })}`
        const hiddenMsg = `Break down the metric (${yAxisStr}) by "${dimension}", filtered to "${name}".
        CRITICAL CONSTRAINTS:
        - Show aggregated values grouped by "${dimension}".
        - Prefer bar chart for the breakdown.
        - Keep the same measurement units.`
        setReplyTo(messageId)
        useChatStore.getState().sendMessage(displayMsg, hiddenMsg)
      }
    },
    [messageId, reportData.vizConfig, setReplyTo, t]
  )

  if (!reportData) return null

  const hasInsight = !!reportData.insight
  const showPanel = hasInsight || manualActive
  const isPinned = pinnedReports.some(r => r?.sourceMessageId === messageId)

  const handleInsightToggle = () => {
    if (hasInsight) {
      const next = !expanded
      setExpanded(next)
      if (!next) setHighlightedItems([])
    } else {
      if (!manualActive) {
        setManualActive(true)
        setTriggerCount(c => c + 1)
        setExpanded(true)
      } else {
        const next = !expanded
        setExpanded(next)
        if (!next) setHighlightedItems([])
      }
    }
  }

  const handleRerun = async () => {
    if (!reportData?.sql || isRerunning) return
    setIsRerunning(true)
    try {
      const result = await window.electronAPI.runSQL(reportData.sql)
      if (result.success && result.data) {
        const { data, columnFields } = result.data
        updateMessageData(messageId, reportData.sql, data, columnFields)
        addToast({
          type: 'success',
          title: t('common:refresh_success'),
        })
      } else {
        throw new Error(result.error || 'Execution failed')
      }
    } catch (e: any) {
      console.error(e)
      addToast({
        type: 'error',
        title: t('chat:error_analysis_failed'),
        description: t('common:refresh_failed_desc'),
      })
    } finally {
      setIsRerunning(false)
    }
  }

  const handleGenerateInsight = async (
    chartData: Array<Record<string, unknown>>,
    instructions?: string
  ) => {
    const domainRules = useSettingsStore.getState().domainRules || []
    const result = await generateInsight.mutateAsync({
      chartTitle: reportData.title || t('chat:analysis_result'),
      chartType: reportData.chartType || 'bar',
      aggregatedData: chartData,
      vizConfig: reportData.vizConfig,
      sql: reportData.sql,
      summary: reportData.summary,
      language,
      domainRules,
      userInstructions: instructions,
    })
    updateMessageInsight(messageId, result)
    return result
  }

  const handlePinToggle = () => {
    if (isPinned) {
      const pinnedReport = pinnedReports.find(
        r => r?.sourceMessageId === messageId
      )
      if (pinnedReport) {
        removeReport(pinnedReport.id)
      }
    } else {
      window.dispatchEvent(new Event('wansan:open-dashboard'))
      pinReport(messageId, reportData, message.timestamp, message.widgetId)
    }
  }

  const handleEditViz = () => {
    let editId = message.widgetId

    if (isPinned) {
      const pinned = pinnedReports.find(r => r?.sourceMessageId === messageId)
      if (pinned) editId = pinned.id
    }

    if (!editId) return

    setEditingReportId(editId)
    // ChartFullView is a fullscreen modal, no need to open dashboard panel
  }

  const handleRunSql = async (newSql: string) => {
    const result = await window.electronAPI.runSQL(newSql)
    if (result.success && result.data) {
      const { data, columnFields } = result.data
      updateMessageData(messageId, newSql, data, columnFields)
    } else {
      throw new Error(result.error || 'Execution failed')
    }
  }

  const handleOpenSqlLab = () => {
    if (!reportData?.sql) return
    openSqlLab({
      mode: 'widget',
      targetId: messageId,
      targetTitle: reportData.title,
      initialSql: reportData.sql,
      reasoning: reportData.reasoning,
      onSave: handleRunSql,
    })
  }

  const handleExportCSV = async () => {
    if (!reportData?.tableData) return
    const csv = dataToCSV(reportData.tableData)
    const res = await window.electronAPI.saveFile({
      content: csv,
      extension: 'csv',
      name: `${reportData.title || 'export'}.csv`
    })
    if (res.success && res.data) {
      const filePath = res.data as string
      addToast({
        type: 'success',
        title: t('common:export_success'),
        description: filePath,
        action: {
          label: t('common:open_folder'),
          onClick: () => window.electronAPI.showItemInFolder(filePath),
        },
      })
    }
  }

  const handleExportExcel = async () => {
    if (!reportData?.tableData) return
    
    setIsExporting(true)
    try {
      addToast({
        type: 'info',
        title: t('common:export_generating_file'),
        description: t('common:exporting_excel'),
        duration: 2000,
      })

      const chartInfo = await captureChartInfo(messageId)
      
      const insightLabels = {
        summary: t('common:insight_summary'),
        findings: t('common:insight_findings'),
        recommendation: t('common:insight_recommendation')
      }

      const sheet = {
        name: sanitizeFilename(reportData.title || 'Analysis', 'Sheet').slice(0, 31),
        data: reportData.tableData,
        columns: reportData.columnFields || [],
        insight: formatInsight(reportData.insight, insightLabels),
        chartImage: chartInfo?.dataUrl,
        chartWidth: chartInfo?.width,
        chartHeight: chartInfo?.height
      }

      const fileName = `${sanitizeFilename(reportData.title || 'Analysis', 'Report')}.xlsx`
      
      const result = await window.electronAPI.exportExcel({
        filename: fileName,
        sheets: [sheet],
        insightTitle: t('common:insights')
      })

      if (result.success && result.data) {
        const filePath = result.data as string
        addToast({
          type: 'success',
          title: t('common:export_success'),
          description: filePath,
          action: {
            label: t('common:open_folder'),
            onClick: () => window.electronAPI.showItemInFolder(filePath),
          },
        })
      } else if (result.error !== 'Cancelled') {
        throw new Error(result.error)
      }
    } catch (e: any) {
      console.error(e)
      addToast({
        type: 'error',
        title: t('common:export_failed'),
        description: e.message || String(e),
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPNG = async () => {
    if (!cardRef.current) return
    
    // 1. Prepare State for Export
    const wasExpanded = expanded
    if (hasInsight && !wasExpanded) {
      setExpanded(true)
    }
    setIsExporting(true)

    // 2. Wait for UI updates (and expansion animation)
    await new Promise(resolve => setTimeout(resolve, 600))

    try {
      const dataUrl = await toPng(cardRef.current, {
        backgroundColor: '#ffffff',
        filter: (node) => !node.classList?.contains('hide-on-export')
      })
      const res = await window.electronAPI.saveImage({
        dataUrl,
        name: `${reportData.title || 'chart'}.png`
      })
      if (res.success && res.data) {
        const filePath = res.data as string
        addToast({
          type: 'success',
          title: t('common:image_saved'),
          description: filePath,
          action: {
            label: t('common:open_folder'),
            onClick: () => window.electronAPI.showItemInFolder(filePath),
          },
        })
      }
    } catch (e: any) {
      console.error(e)
      useUIStore.getState().showError(
        t('common:export_failed'),
        t('chat:error_processing_request'),
        e.stack || String(e)
      )
    } finally {
      // 3. Restore State
      setIsExporting(false)
      if (hasInsight && !wasExpanded) {
        setExpanded(false)
      }
    }
  }

  const rowCount = reportData?.tableData?.length || 0

  return (
    <div
      ref={cardRef}
      data-export-id={messageId}
      className={cn(
        'flex flex-col border border-zinc-200 rounded-xl bg-white shadow-sm transition-all overflow-hidden h-full group report-card-container',
        className
      )}
    >
      <div className="flex-1 min-h-0" data-export-split="chart">
        {reportData && (
          <VizRenderer
            {...reportData}
            variant="chat"
            timestamp={message.timestamp}
            messageId={messageId}
            highlightedItems={isExporting ? [] : highlightedItems}
            onDrillDownAction={handleDrillDown}
            className="p-5 bg-white"
          />
        )}
      </div>

      {showPanel && (
        <div className="border-t border-zinc-100 bg-zinc-50/30 p-3" data-export-split="insight">
          <InsightPanel
            title={reportData.title}
            chartType={reportData.chartType}
            chartData={reportData.tableData || []}
            insight={reportData.insight}
            onGenerateInsight={handleGenerateInsight}
            expanded={expanded}
            onExpandChange={val => {
              setExpanded(val)
              if (!val) setHighlightedItems([])
            }}
            hiddenIfIdle={true}
            requestTrigger={triggerCount}
            onCancel={() => {
              setManualActive(false)
              setExpanded(false)
            }}
            onHighlight={setHighlightedItems}
            readOnly={true}
          />
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-50 bg-white hide-on-export">
        {/* Left: AI Insight Trigger */}
        <div>
          {!hasInsight && !manualActive && (
            <button
              onClick={handleInsightToggle}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors border border-indigo-100"
            >
              <Lightbulb className="w-3.5 h-3.5 fill-current" />
              <span className="text-xs font-medium">{t('ai_insight')}</span>
            </button>
          )}
        </div>

        {/* Right: Standard Actions */}
        <div className="flex items-center gap-1">
          <ExpandableAction
            icon={<SquarePen className="h-3.5 w-3.5" />}
            label={t('common:edit_viz')}
            onClick={handleEditViz}
          />

          {reportData?.is_template && onConfigure && (
            <ExpandableAction
              icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
              label={t('chat:modify_parameters')}
              onClick={onConfigure}
            />
          )}

          <ExpandableAction
            icon={<Code className="h-3.5 w-3.5" />}
            label={t('common:inspect_code')}
            onClick={handleOpenSqlLab}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="group relative flex items-center justify-center overflow-hidden transition-all duration-300 ease-out h-8 border border-transparent w-8 hover:w-auto hover:px-3 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50"
              >
                <span className="shrink-0 flex items-center justify-center">
                  <Download className="h-3.5 w-3.5" />
                </span>
                <span className="whitespace-nowrap overflow-hidden text-xs font-medium transition-all duration-300 ease-out w-0 opacity-0 ml-0 group-hover:w-auto group-hover:opacity-100 group-hover:ml-2">
                  {t('common:export')}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportExcel} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                <span>{t('common:export_excel')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV} className="gap-2">
                <FileText className="w-4 h-4" />
                <span>{t('common:export_csv')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPNG} className="gap-2">
                <Image className="w-4 h-4" />
                <span>{t('common:export_image')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ExpandableAction
            icon={
              <RefreshCw
                className={cn('h-3.5 w-3.5', isRerunning && 'animate-spin')}
              />
            }
            label={t('chat:rerun')}
            onClick={handleRerun}
            disabled={isRerunning}
          />

          <ExpandableAction
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label={t('chat:refine')}
            onClick={() => setReplyTo(messageId)}
          />

          <ExpandableAction
            icon={
              <Pin
                className={cn(
                  'w-3.5 h-3.5',
                  isPinned && 'fill-current text-orange-600'
                )}
              />
            }
            label={isPinned ? t('common:pinned') : t('common:pin')}
            onClick={handlePinToggle}
            active={isPinned}
            className={
              isPinned ? 'text-orange-600 bg-orange-50 border-orange-100' : ''
            }
          />
        </div>
      </div>

      <div className="px-4 py-1.5 border-t border-zinc-50 bg-zinc-50/30 text-[10px] text-zinc-500 flex justify-between items-center select-none font-medium hide-on-export">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
          <span>{t('chat:lineage_engine')}</span>
        </div>
        <div className="font-mono tabular-nums opacity-70 flex gap-2">
          <span>
            {t('chat:lineage_stats', { rowCount: rowCount.toLocaleString() })}
          </span>
          <span className="opacity-40">|</span>
          <span>
            {message.metadata?.aiLatency !== undefined &&
            message.metadata?.dbLatency !== undefined
              ? t('chat:lineage_latency_split', {
                  aiLatency: message.metadata.aiLatency.toFixed(0),
                  dbLatency: message.metadata.dbLatency.toFixed(0),
                })
              : t('chat:lineage_latency_total', {
                  latency: (message.metadata?.latency || 0).toFixed(0),
                })}
          </span>
        </div>
      </div>
    </div>
  )
})
