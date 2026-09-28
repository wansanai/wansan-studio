import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AreaChart,
  ArrowUpDown,
  BarChart3,
  Gauge,
  LineChart,
  PieChart,
  Radar,
  RotateCcw,
  Save,
  ScatterChart,
  Table2,
  X,
} from 'lucide-react'
import type { DenormalizedReportWidget } from '@/stores/useWorkbenchStore'
import { useWorkbenchStore } from '@/stores/useWorkbenchStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useChatStore } from '@/stores/useChatStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { VizChart } from '../core/VizChart'
import { DataTable } from '../base/DataTable'
import { KpiGrid } from '../base/KpiGrid'
import { cn } from '@/utils/cn'
import type {
  ChartType,
  InsightResult,
  ReportData,
} from '@shared/types/dashboard'
import { useTranslation } from 'react-i18next'
import { adaptChartConfig } from '@/lib/viz-adapter'
import { InsightPanel } from '../InsightPanel'
import { useGenerateInsight } from '@/hooks/useIPC'
import { CodeEditor } from '@/components/ui/CodeEditor'
import TextareaAutosize from 'react-textarea-autosize'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const chartTypeOptions: Array<{
  value: ChartType
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}> = [
  { value: 'bar', label: 'chart_bar', icon: BarChart3 },
  { value: 'line', label: 'chart_line', icon: LineChart },
  { value: 'area', label: 'chart_area', icon: AreaChart },
  { value: 'pie', label: 'chart_pie', icon: PieChart },
  { value: 'rose', label: 'chart_rose', icon: PieChart },
  { value: 'scatter', label: 'chart_scatter', icon: ScatterChart },
  { value: 'radar', label: 'chart_radar', icon: Radar },
  { value: 'table', label: 'chart_table', icon: Table2 },
  { value: 'kpi', label: 'chart_kpi', icon: Gauge },
  // { value: 'text', label: 'chart_text', icon: Type },
]

export function ChartFullView() {
  const editingReportId = useWorkbenchStore(state => state.editingReportId)
  const setEditingReportId = useWorkbenchStore(
    state => state.setEditingReportId
  )
  const pinnedReports = useWorkbenchStore(state => state.pinnedReports)
  const widgetRegistry = useProjectStore(state => state.widgetRegistry)
  const { t, i18n } = useTranslation(['common', 'settings'])
  const generateInsight = useGenerateInsight()
  const language = i18n.language === 'zh' ? 'zh' : 'en'
  const globalShowLabels = useSettingsStore(state => state.showChartLabels)

  const [highlightedItems, setHighlightedItems] = useState<string[]>([])

  const report = useMemo(() => {
    const pinned = pinnedReports.find(r => r.id === editingReportId)
    if (pinned) return pinned
    if (editingReportId && widgetRegistry[editingReportId]) {
      return {
        id: editingReportId,
        widgetId: editingReportId,
        reportData: widgetRegistry[editingReportId],
        layout: { i: editingReportId, x: 0, y: 0, w: 0, h: 0 },
        pageIndex: 0,
        sourceMessageId: '',
      } as DenormalizedReportWidget
    }
    return undefined
  }, [editingReportId, pinnedReports, widgetRegistry])

  const [localType, setLocalType] = useState<ReportData['chartType'] | null>(
    null
  )
  const [localConfig, setLocalConfig] = useState<
    ReportData['vizConfig'] | null
  >(null)
  const [localTitle, setLocalTitle] = useState<string | null>(null)
  const [localContent, setLocalContent] = useState<string | null>(null)
  const [localSummary, setLocalSummary] = useState<string | null>(null)
  const [localInsight, setLocalInsight] = useState<InsightResult | null>(null)

  // Derive effective values
  const effectiveType = localType ?? report?.reportData.chartType ?? 'bar'
  const effectiveConfig = localConfig ?? report?.reportData.vizConfig
  const effectiveTitle = localTitle ?? report?.reportData.title ?? ''
  const effectiveContent = localContent ?? report?.reportData.content ?? ''
  const effectiveSummary = localSummary ?? report?.reportData.summary ?? ''
  const effectiveInsight = localInsight ?? report?.reportData.insight

  // Reset local state when switching or closing reports
  useEffect(() => {
    if (!editingReportId) {
      setLocalType(null)
      setLocalConfig(null)
      setLocalTitle(null)
      setLocalContent(null)
      setLocalSummary(null)
      setLocalInsight(null)
    }
  }, [editingReportId])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingReportId(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setEditingReportId])

  // Data extraction
  const data = report?.reportData.tableData || []
  const columnFields = report?.reportData.columnFields || []
  const columns =
    columnFields.length > 0
      ? columnFields.map(f => f.name)
      : data[0]
        ? Object.keys(data[0])
        : []

  const availableColumns = columns
  const yAxisValues = useMemo(() => {
    const raw = effectiveConfig?.y_axis
    if (Array.isArray(raw)) return raw.filter(Boolean) as string[]
    if (typeof raw === 'string' && raw) return [raw]
    return []
  }, [effectiveConfig?.y_axis])

  const yAxisOptions = useMemo(
    () => availableColumns.filter(col => col !== effectiveConfig?.x_axis),
    [availableColumns, effectiveConfig?.x_axis]
  )

  const handleChartTypeChange = (type: ChartType) => {
    const adapted = adaptChartConfig(
      type,
      effectiveType,
      effectiveConfig,
      data || []
    )
    setLocalType(adapted.type as ChartType)
    setLocalConfig(prev => ({
      ...(prev || effectiveConfig || {}),
      ...adapted.config,
    }))
  }

  const handleXAxisChange = (value: string) => {
    setLocalConfig(prev => ({
      ...(prev || effectiveConfig || {}),
      x_axis: value || null,
    }))
  }

  const handleYAxisToggle = (value: string) => {
    const isSelected = yAxisValues.includes(value)
    const nextY = isSelected
      ? yAxisValues.filter(v => v !== value)
      : [...yAxisValues, value]
    setLocalConfig(prev => ({
      ...(prev || effectiveConfig || {}),
      y_axis: nextY.length > 0 ? nextY : null,
    }))
  }

  const handleSplitByChange = (value: string) => {
    setLocalConfig(prev => ({
      ...(prev || effectiveConfig || {}),
      split_by: value || null,
    }))
  }

  const handleSwapAxes = () => {
    if (!effectiveConfig?.x_axis || yAxisValues.length === 0) return
    setLocalConfig(prev => ({
      ...(prev || effectiveConfig || {}),
      x_axis: yAxisValues[0],
      y_axis: [effectiveConfig.x_axis!, ...yAxisValues.slice(1)],
    }))
  }

  const handleGenerateInsight = async (
    chartData: Array<Record<string, unknown>>,
    instructions?: string
  ) => {
    const domainRules = useSettingsStore.getState().domainRules || []
    const result = await generateInsight.mutateAsync({
      chartTitle: effectiveTitle,
      chartType: effectiveType,
      aggregatedData: chartData,
      vizConfig: effectiveConfig,
      sql: report?.reportData.sql, // Use SQL from report data
      summary: effectiveSummary,
      language,
      domainRules,
      userInstructions: instructions
    })
    setLocalInsight(result as InsightResult)
    return result
  }

  const handleDrillDown = useCallback(
    (
      _action: 'focus' | 'view_data' | 'breakdown',
      _payload: { name: string; dimension?: string }
    ) => {
      setEditingReportId(null)
      if (report?.sourceMessageId) {
        useChatStore.getState().setReplyTo(report.sourceMessageId)
      }
      // sendMessage implementation would go here if needed in full view
    },
    [report, setEditingReportId]
  )

  const handleSave = () => {
    if (!report) return

    // Save everything to Registry / Workbench
    const finalReportData: Partial<ReportData> = {
      chartType: effectiveType,
      vizConfig: effectiveConfig,
      title: effectiveTitle.trim(),
      content: effectiveContent,
      summary: effectiveSummary,
      insight: effectiveInsight,
    }

    // 获取 widgetId:
    // - 如果是 pinnedReport,从 session.dashboard.widgets 查找原始 widget 获取 widgetId
    // - 如果是未固定的,editingReportId 本身就是 widgetId
    let widgetId: string | undefined
    const pinned = pinnedReports.find(r => r.id === editingReportId)
    if (pinned) {
      // 从 session.dashboard.widgets 查找原始 widget
      const session = useProjectStore
        .getState()
        .sessions.find(s => s.id === useProjectStore.getState().activeSessionId)
      const widget = session?.dashboard.widgets.find(w => w.id === report.id)
      widgetId = widget?.widgetId
    } else {
      // 未固定的情况,editingReportId 就是 widgetId
      widgetId = editingReportId || undefined
    }

    if (!widgetId) return

    // 直接通过 widgetId 更新 widgetRegistry (单一数据源)
    useProjectStore
      .getState()
      .updateRegistryByWidgetId(widgetId, finalReportData)

    setEditingReportId(null)
  }

  let displayMode = 'chart'
  if (effectiveType === 'table') displayMode = 'table'
  else if (effectiveType === 'kpi') displayMode = 'bignumber'
  else if (effectiveType === 'text') displayMode = 'text'
  else if (!data || data.length === 0) displayMode = 'empty'

  const showAxisControls =
    (displayMode === 'chart' || displayMode === 'bignumber') &&
    availableColumns.length > 0
  const modalMaxWidth =
    displayMode === 'table' ? 'max-w-[95vw]' : 'max-w-[1600px]'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
      <div
        className={cn(
          'relative flex h-[92vh] w-[94vw] rounded-xl border border-zinc-200 bg-white shadow-2xl overflow-hidden',
          modalMaxWidth
        )}
      >
        <div className="flex flex-1 flex-col min-w-0">
          {/* 1. Header & Summary Area */}
          <div className="flex flex-col border-b border-zinc-100 bg-white px-6 py-4 shrink-0 gap-2">
            <div className="flex items-center justify-between gap-4">
              <input
                className="flex-1 border-none text-2xl font-black text-zinc-900 outline-none focus:ring-0 p-0 tracking-tight"
                value={effectiveTitle}
                onChange={e => setLocalTitle(e.target.value)}
                placeholder={t('untitled_report')}
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setEditingReportId(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-bold text-zinc-600 hover:bg-zinc-50 transition-all"
                >
                  <X className="h-4 w-4" />
                  {t('close')}
                </button>
                <button
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-zinc-200 hover:bg-zinc-800 transition-all active:scale-95"
                >
                  <Save className="h-4 w-4" />
                  {t('save')}
                </button>
              </div>
            </div>

            {/* ReportData.summary Editor (Subtitle style) */}
            {effectiveType !== 'text' && (
              <div className="relative group">
                <TextareaAutosize
                  value={effectiveSummary}
                  onChange={e => setLocalSummary(e.target.value)}
                  placeholder={t('placeholder_report_summary')}
                  className="w-full resize-none bg-transparent border-none p-0 text-sm text-zinc-500 font-medium focus:ring-0 outline-none leading-relaxed placeholder:text-zinc-300"
                  minRows={1}
                  maxRows={4}
                />
              </div>
            )}
          </div>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 p-6 min-w-0 flex flex-col gap-6 overflow-y-auto bg-zinc-50/30">
              {/* 2. Primary Visualization Area */}
              <div className="flex-1 min-h-[400px] rounded-2xl border border-zinc-200 bg-white p-6 relative overflow-hidden shadow-sm shrink-0">
                {displayMode === 'text' && (
                  <div className="h-full w-full bg-white rounded-lg overflow-hidden border border-zinc-50">
                    <CodeEditor
                      value={effectiveContent}
                      onChange={setLocalContent}
                      language="markdown"
                      className="h-full"
                    />
                  </div>
                )}

                {displayMode === 'bignumber' && (
                  <div className="h-full w-full flex items-center justify-center">
                    <KpiGrid
                      reportData={{
                        title: effectiveTitle,
                        chartType: effectiveType,
                        tableData: data,
                        vizConfig: effectiveConfig,
                      }}
                      variant="dashboard"
                      highlightedItems={highlightedItems}
                    />
                  </div>
                )}

                {displayMode === 'chart' && (
                  <VizChart
                    type={effectiveType}
                    title={effectiveTitle}
                    data={data}
                    config={effectiveConfig}
                    className="h-full w-full"
                    highlightedItems={highlightedItems}
                    onDrillDownAction={handleDrillDown}
                  />
                )}

                {displayMode === 'table' && (
                  <div className="h-full w-full overflow-auto">
                    <DataTable
                      data={data}
                      columnFields={columnFields}
                      variant="dashboard"
                      highlightedItems={highlightedItems}
                    />
                  </div>
                )}

                {displayMode === 'empty' && (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    {t('no_data')}
                  </div>
                )}
              </div>

              {/* 3. Business Insight Panel (Details Area) */}
              {displayMode !== 'text' && (
                <div className="shrink-0 pb-4">
                  <InsightPanel
                    chartData={data}
                    config={effectiveConfig}
                    insight={effectiveInsight}
                    onGenerateInsight={handleGenerateInsight}
                    onSave={setLocalInsight}
                    onHighlight={setHighlightedItems}
                    defaultExpanded={true}
                    readOnly={false}
                    onRemove={() => setLocalInsight(null)}
                  />
                </div>
              )}
            </div>

            {/* 4. Settings Sidebar */}
            <div className="w-[340px] border-l border-zinc-200 bg-white p-6 overflow-y-auto shrink-0 flex flex-col gap-8">
              <div>
                <div className="mb-4 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
                  {t('visualization')}
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {chartTypeOptions.map(option => {
                    const Icon = option.icon
                    const isActive = effectiveType === option.value
                    return (
                      <button
                        key={option.value}
                        onClick={() => handleChartTypeChange(option.value)}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl border p-3 text-[10px] font-bold transition-all duration-200',
                          isActive
                            ? 'border-zinc-900 bg-zinc-900 text-white shadow-xl scale-105 z-10'
                            : 'border-zinc-100 bg-zinc-50 text-zinc-400 hover:border-zinc-300 hover:bg-white hover:text-zinc-600'
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="w-full truncate text-center whitespace-nowrap">
                          {t(option.label)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Display Options */}
              <div className="space-y-4">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
                  {t('settings:tabs.general')}
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-zinc-100 bg-zinc-50/50">
                  <div className="flex items-center gap-2 h-5">
                    <Label 
                      htmlFor="show-labels-toggle"
                      className="text-xs font-bold text-zinc-600 cursor-pointer select-none"
                    >
                      {t('settings:general.chart_labels_label')}
                    </Label>
                    {effectiveConfig?.show_labels !== undefined && (
                      <button 
                        onClick={() => {
                          setLocalConfig(prev => {
                            const next = { ...(prev || effectiveConfig || {}) }
                            delete next.show_labels
                            return next
                          })
                        }}
                        title={t('reset')}
                        className="p-1 rounded-md text-zinc-400 hover:text-indigo-600 hover:bg-zinc-200/50 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <Checkbox 
                    id="show-labels-toggle"
                    checked={effectiveConfig?.show_labels ?? globalShowLabels}
                    onChange={(e) => {
                      setLocalConfig(prev => ({
                        ...(prev || effectiveConfig || {}),
                        show_labels: e.target.checked
                      }))
                    }}
                  />
                </div>
              </div>

              {showAxisControls && (
                <div className="space-y-6 animate-in slide-in-from-right-2">
                  <div className="flex items-center justify-between text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
                    <span>{t('axes')}</span>
                    <button
                      onClick={handleSwapAxes}
                      className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors border border-transparent hover:border-zinc-200"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 ml-1 uppercase tracking-tight">
                      {t('x_axis')}
                    </label>
                    <select
                      value={effectiveConfig?.x_axis ?? ''}
                      onChange={e => handleXAxisChange(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs font-bold text-zinc-700 focus:ring-2 focus:ring-indigo-100 focus:bg-white outline-none transition-all cursor-pointer"
                    >
                      <option value="">{t('select_column')}</option>
                      {availableColumns.map(col => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 ml-1 uppercase tracking-tight">
                      {t('split_by_label')}
                    </label>
                    <select
                      value={effectiveConfig?.split_by ?? ''}
                      onChange={e => handleSplitByChange(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs font-bold text-zinc-700 focus:ring-2 focus:ring-indigo-100 focus:bg-white outline-none transition-all cursor-pointer"
                    >
                      <option value="">{t('reset')}</option>
                      {availableColumns
                        .filter(col => col !== effectiveConfig?.x_axis)
                        .map(col => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-zinc-500 ml-1 uppercase tracking-tight">
                      {t('y_axis')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {yAxisOptions.map(col => {
                        const isSelected = yAxisValues.includes(col)
                        return (
                          <button
                            key={col}
                            onClick={() => handleYAxisToggle(col)}
                            className={cn(
                              'px-3 py-2 text-[10px] font-bold rounded-xl border transition-all duration-200',
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100'
                                : 'bg-zinc-50 border-zinc-100 text-zinc-500 hover:border-zinc-300 hover:bg-white'
                            )}
                          >
                            {col}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
