import React, { useCallback, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Check,
  RefreshCw,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  Rocket,
  Target,
  Info,
  Plus,
  Edit2,
  Save,
  X as CloseIcon,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { SimpleMarkdown } from '../ui/simple-markdown'
import type { InsightResult, ReportData } from '@shared/types/dashboard'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import TextareaAutosize from 'react-textarea-autosize'
import { Analytics } from '../../services/analytics'

type InsightState = 'idle' | 'consent' | 'analyzing' | 'done' | 'error'

type FindingSentiment = NonNullable<InsightResult['findings'][number]['sentiment']> | 'neutral'

const SENTIMENT_ICONS: Record<FindingSentiment, { icon: LucideIcon; color: string; label: string }> = {
  positive: { icon: TrendingUp, color: 'text-emerald-500', label: 'Positive' },
  negative: { icon: TrendingDown, color: 'text-rose-500', label: 'Negative' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', label: 'Warning' },
  growth: { icon: Rocket, color: 'text-blue-500', label: 'Growth' },
  discovery: { icon: Sparkles, color: 'text-purple-500', label: 'Discovery' },
  target: { icon: Target, color: 'text-indigo-500', label: 'Target' },
  info: { icon: Info, color: 'text-zinc-500', label: 'Info' },
  neutral: { icon: Minus, color: 'text-zinc-400', label: 'Neutral' },
}

interface InsightPanelProps {
  /** Chart title for context */
  title?: string
  /** Aggregated chart data (what will be sent to AI) */
  chartData: Array<Record<string, unknown>>
  /** Chart type for context */
  chartType?: string
  /** Current chart configuration */
  config?: ReportData['vizConfig']
  /** Existing insight text if available */
  insight?: string | InsightResult
  /** Called to request AI insight generation */
  onGenerateInsight: (
    data: Array<Record<string, unknown>>,
    instructions?: string
  ) => Promise<InsightResult | string>
  className?: string
  expanded?: boolean
  defaultExpanded?: boolean
  onExpandChange?: (expanded: boolean) => void
  hiddenIfIdle?: boolean
  requestTrigger?: number
  onCancel?: () => void
  onRemove?: () => void
  onSave?: (insight: InsightResult) => void
  /** Called when hovering over a finding to highlight chart elements */
  onHighlight?: (items: string[]) => void
  readOnly?: boolean
  headerClassName?: string
}

export function InsightPanel({
  chartData,
  chartType,
  insight,
  onGenerateInsight,
  className,
  expanded,
  defaultExpanded = false,
  onExpandChange,
  requestTrigger = 0,
  hiddenIfIdle = false,
  onCancel,
  onRemove,
  onHighlight,
  onSave,
  config,
  readOnly = false,
  headerClassName,
}: InsightPanelProps) {
  const { t } = useTranslation('common')
  const [state, setState] = useState<InsightState>(insight ? 'done' : 'idle')
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const [insightData, setInsightData] = useState<InsightResult | null>(
    typeof insight === 'string' ? null : (insight as InsightResult) || null
  )
  const [error, setError] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [editBuffer, setEditEditBuffer] = useState<InsightResult | null>(null)
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null)
  const [instructions, setInstructions] = useState('')
  const hasAutoExpanded = React.useRef(false)

  const isExpanded = expanded !== undefined ? expanded : internalExpanded
  const dataPointCount = chartData.length

  useEffect(() => {
    if (insight && typeof insight !== 'string') {
      setInsightData(insight)
      setState('done')
      if (expanded === undefined && !hasAutoExpanded.current) {
        setInternalExpanded(true)
        hasAutoExpanded.current = true
      }
    }
  }, [insight, expanded])

  useEffect(() => {
    if (requestTrigger > 0 && state === 'idle' && !insight) {
      setState('consent')
    }
  }, [requestTrigger, state, insight])

  useEffect(() => {
    if (expanded !== undefined) {
      setInternalExpanded(expanded)
    }
  }, [expanded])

  const toggleExpanded = () => {
    if (isEditing) return
    const next = !isExpanded
    if (onExpandChange) {
      onExpandChange(next)
    }
    setInternalExpanded(next)
  }

  const handleRequestInsight = useCallback(() => {
    setState('consent')
  }, [])

  const handleConfirmSend = useCallback(async () => {
    setState('analyzing')
    setError('')
    const startTime = Date.now()
    try {
      const result = await onGenerateInsight(chartData, instructions)
      const data = typeof result === 'string' ? null : result
      setInsightData(data)
      setState('done')
      setInternalExpanded(true)
      onExpandChange?.(true)

      Analytics.track('insight_generated', {
        chart_type: chartType || 'unknown',
        data_points: dataPointCount,
        duration: Date.now() - startTime,
        has_instructions: !!instructions,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate insight')
      setState('error')
    }
  }, [chartData, onGenerateInsight, onExpandChange, chartType, dataPointCount, instructions])

  const handleStartEdit = () => {
    setEditEditBuffer(JSON.parse(JSON.stringify(insightData || {
        summary: '',
        findings: [],
        recommendation: ''
    })))
    setIsEditing(true)
    setActiveFindingId(null)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditEditBuffer(null)
    setActiveFindingId(null)
  }

  const handleSaveEdit = () => {
    if (editBuffer && onSave) {
      onSave(editBuffer)
      setInsightData(editBuffer)
      Analytics.track('insight_edited', {
        fields: Object.keys(editBuffer).filter(k => editBuffer[k as keyof InsightResult] !== insightData?.[k as keyof InsightResult])
      })
    }
    setIsEditing(false)
    setActiveFindingId(null)
  }

  const updateFinding = (
    id: string,
    updates: Partial<InsightResult['findings'][number]>
  ) => {
    if (!editBuffer) return
    setEditEditBuffer({
      ...editBuffer,
      findings: editBuffer.findings.map(f => (f.id === id ? { ...f, ...updates } : f)),
    })
  }

  const addFinding = () => {
    if (!editBuffer) return
    const newFinding = {
      id: crypto.randomUUID(),
      markdown: '',
      sentiment: 'neutral' as const,
      relatedItems: [],
    }
    setEditEditBuffer({
      ...editBuffer,
      findings: [...editBuffer.findings, newFinding],
    })
    setActiveFindingId(newFinding.id)
  }

  const removeFinding = (id: string) => {
    if (!editBuffer) return
    setEditEditBuffer({
      ...editBuffer,
      findings: editBuffer.findings.filter(f => f.id !== id),
    })
    if (activeFindingId === id) setActiveFindingId(null)
  }

  const handleRegenerate = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      Analytics.track('insight_regenerate_click', { chart_type: chartType })
      setState('consent')
    },
    [chartType]
  )

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (onRemove) {
        onRemove()
        setState('idle')
        setInsightData(null)
        setInstructions('')
      }
    },
    [onRemove]
  )

  const handleCancel = useCallback(() => {
    if (insightData) {
      setState('done')
    } else {
      setState('idle')
      onCancel?.()
    }
  }, [onCancel, insightData])

  const renderSentimentIcon = (sentiment?: string) => {
    const config = SENTIMENT_ICONS[sentiment || 'neutral'] || SENTIMENT_ICONS.neutral
    const Icon = config.icon
    return <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', config.color)} />
  }

  const renderEditForm = () => {
    if (!editBuffer) return null

    return (
      <div className="space-y-6 pt-2 pb-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">
            {t('insight_summary')}
          </label>
          <TextareaAutosize
            value={editBuffer.summary}
            onChange={e => setEditEditBuffer({ ...editBuffer, summary: e.target.value })}
            placeholder={t('placeholder_summary')}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between ml-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              {t('insight_findings')}
            </label>
            <button
              onClick={addFinding}
              className="p-1 hover:bg-indigo-50 text-indigo-600 rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            {editBuffer.findings.map(f => (
              <div key={f.id} className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 relative group/finding">
                <div className="flex gap-3">
                  <div className="relative pt-1 shrink-0">
                    <IconSelector 
                        current={f.sentiment || 'neutral'} 
                        onSelect={(key) => updateFinding(f.id, { sentiment: key })} 
                    />
                  </div>

                  <div className="flex-1 space-y-2 min-w-0">
                    {activeFindingId === f.id ? (
                        <MarkdownEditor
                          value={f.markdown}
                          onChange={val => updateFinding(f.id, { markdown: val })}
                          placeholder={t('placeholder_finding')}
                          className="min-h-[60px]"
                        />
                    ) : (
                        <div 
                            onClick={() => setActiveFindingId(f.id)}
                            className="min-h-[40px] p-2 rounded-lg border border-transparent hover:bg-white hover:border-zinc-200 hover:shadow-sm cursor-text transition-all group/preview"
                        >
                            {f.markdown ? (
                                <SimpleMarkdown 
                                    content={f.markdown} 
                                    className="prose-p:my-0 prose-p:leading-relaxed pointer-events-none" 
                                /> 
                            ) : (
                                <span className="text-zinc-400 italic text-xs">{t('placeholder_finding')}</span>
                            )}
                        </div>
                    )}
                    
                    <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase mr-1">{t('insight_anchors')}:</span>
                        {f.relatedItems?.map(item => (
                            <div key={item} className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded border border-indigo-100 animate-in zoom-in-95">
                                {item}
                                <button 
                                    onClick={() => updateFinding(f.id, { relatedItems: f.relatedItems?.filter(i => i !== item) })}
                                    className="hover:text-rose-500 ml-1"
                                >
                                    <CloseIcon className="w-2.5 h-2.5" />
                                </button>
                            </div>
                        ))}
                        <select 
                            className="bg-transparent border-none text-[10px] text-zinc-400 focus:ring-0 outline-none cursor-pointer hover:text-indigo-600 appearance-none font-bold"
                            onChange={(e) => {
                                if (e.target.value && !f.relatedItems?.includes(e.target.value)) {
                                    updateFinding(f.id, { relatedItems: [...(f.relatedItems || []), e.target.value] })
                                }
                                e.target.value = ''
                            }}
                        >
                            <option value="">+ {t('add_anchor')}</option>
                            {(() => {
                                const xField = config?.x_axis || (chartData[0] ? Object.keys(chartData[0])[0] : null)
                                if (!xField) return null
                                return Array.from(new Set(chartData.map(d => String(d[xField])))).map(val => (
                                    <option key={val} value={val}>{val}</option>
                                ))
                            })()}
                        </select>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => removeFinding(f.id)}
                  className="absolute -right-2 -top-2 w-6 h-6 bg-white border border-zinc-200 rounded-full flex items-center justify-center text-zinc-400 hover:text-rose-500 shadow-sm opacity-0 group-hover/finding:opacity-100 transition-opacity"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">
            {t('insight_recommendation')}
          </label>
          <TextareaAutosize
            value={editBuffer.recommendation}
            onChange={e => setEditEditBuffer({ ...editBuffer, recommendation: e.target.value })}
            placeholder={t('placeholder_recommendation')}
            className="w-full bg-emerald-50/30 border border-emerald-100/50 rounded-lg p-3 text-sm text-emerald-900 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 mt-4">
            <button
                onClick={handleCancelEdit}
                className="px-3 py-1.5 text-xs font-bold text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors"
            >
                {t('cancel')}
            </button>
            <button
                onClick={handleSaveEdit}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
            >
                <Save className="w-3.5 h-3.5" />
                {t('save')}
            </button>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    if (!insightData) return null
    if (isEditing) return renderEditForm()

    const { summary, findings, recommendation } = insightData

    return (
      <div className="space-y-4 pt-1">
        {summary && (
          <div className="text-sm text-zinc-700 font-medium leading-relaxed bg-white/60 p-3 rounded-lg border border-indigo-50/50 shadow-sm">
            {summary}
          </div>
        )}

        {findings && findings.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider ml-1">
              {t('insight_findings')}
            </div>
            <ul className="space-y-1">
              {findings.map((item, idx) => (
                <li
                  key={item.id || idx}
                  className="group flex items-start gap-3 p-2.5 rounded-lg hover:bg-white hover:shadow-md hover:ring-1 hover:ring-indigo-100 transition-all duration-200 cursor-default"
                  onMouseEnter={() => onHighlight?.(item.relatedItems || [])}
                  onMouseLeave={() => onHighlight?.([])}
                >
                  {renderSentimentIcon(item.sentiment)}
                  <div className="text-sm text-zinc-600 group-hover:text-zinc-900 transition-colors flex-1">
                    <SimpleMarkdown
                      content={item.markdown}
                      className="prose-p:my-0 prose-p:leading-relaxed"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recommendation && (
          <div className="flex items-start gap-3 p-3 bg-emerald-50/50 border border-emerald-100/50 rounded-lg">
            < Lightbulb className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-emerald-800 leading-relaxed font-medium w-full">
              <SimpleMarkdown content={recommendation} className="prose-p:my-0 prose-p:leading-relaxed text-emerald-800" />
            </div>
          </div>
        )}
      </div>
    )
  }

  if (state === 'idle') {
    if (hiddenIfIdle) return null
    return (
      <button
        onClick={handleRequestInsight}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors',
          className
        )}
      >
        <Sparkles className="w-4 h-4" />
        <span>{t('ai_insight')}</span>
      </button>
    )
  }

  if (state === 'consent') {
    if (insightData) {
      return (
        <div
          className={cn(
            'relative rounded-xl overflow-hidden border border-indigo-100 shadow-sm',
            className
          )}
        >
          <div className="opacity-50 blur-[1px]">
            <InsightSkeleton className="border-0 shadow-none" />
          </div>

          <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-white/60 backdrop-blur-[1px]">
            <div className="w-full bg-white border border-indigo-100 rounded-xl p-4 shadow-xl animate-in zoom-in-95 fade-in duration-200">
              <InsightConsentForm
                dataPointCount={dataPointCount}
                instructions={instructions}
                setInstructions={setInstructions}
                onConfirm={handleConfirmSend}
                onCancel={handleCancel}
              />
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        className={cn(
          'border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/20 rounded-xl p-4 shadow-sm',
          className
        )}
      >
        <InsightConsentForm
          dataPointCount={dataPointCount}
          instructions={instructions}
          setInstructions={setInstructions}
          onConfirm={handleConfirmSend}
          onCancel={handleCancel}
        />
      </div>
    )
  }

  if (state === 'analyzing') {
    return <InsightSkeleton className={className} />
  }

  if (state === 'error') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 bg-red-50/50 border border-red-100 rounded-xl',
          className
        )}
      >
        <AlertTriangle className="w-5 h-5 text-red-500" />
        <span className="text-sm text-red-700">{error}</span>
        <button
          onClick={handleCancel}
          className="ml-auto text-xs text-red-600 hover:text-red-800"
        >
          {t('dismiss')}
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'border border-indigo-100 bg-gradient-to-br from-indigo-50/30 to-white rounded-xl overflow-hidden',
        className,
        isEditing && 'ring-2 ring-indigo-500 border-transparent shadow-2xl'
      )}
    >
      <div
        onClick={toggleExpanded}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 cursor-pointer transition-colors select-none rounded-xl",
          className?.includes('bg-transparent') ? "hover:bg-zinc-200/50" : "hover:bg-indigo-50/50",
          headerClassName
        )}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-medium text-indigo-700">
            {t('ai_insight')}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                onClick={e => { e.stopPropagation(); handleSaveEdit(); }}
                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded bg-transparent transition-colors"
                title={t('save')}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleCancelEdit(); }}
                className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 rounded bg-transparent transition-colors"
                title={t('cancel')}
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </>
          ) : (
            isExpanded && (
              <>
                {!readOnly && (
                  <button
                    onClick={e => { e.stopPropagation(); handleStartEdit(); }}
                    className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded bg-transparent transition-colors"
                    title={t('edit')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {!readOnly && (
                  <button
                    onClick={handleRegenerate}
                    className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded bg-transparent transition-colors"
                    title={t('regenerate')}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
                {onRemove && (
                  <button
                    onClick={handleRemove}
                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded bg-transparent transition-colors"
                    title={t('remove')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="w-[1px] h-3 bg-zinc-200 mx-1" />
              </>
            )
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-indigo-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-indigo-400" />
          )}
        </div>
      </div>

      {isExpanded && <div className="px-4 pb-4">{renderContent()}</div>}
    </div>
  )
}

function InsightConsentForm({
  dataPointCount,
  instructions,
  setInstructions,
  onConfirm,
  onCancel,
}: {
  dataPointCount: number
  instructions: string
  setInstructions: (val: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation('common')

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100">
        <Sparkles className="w-4 h-4 text-indigo-500" />
      </div>
      <div className="flex-1 w-full min-w-0">
        <div className="text-sm font-bold text-zinc-800">
          {t('insight_consent_title')}
        </div>
        <div className="text-xs text-zinc-500 mt-1 leading-relaxed">
          {t('insight_consent_desc', { count: dataPointCount })}
        </div>

        <div className="mt-3 w-full">
          <TextareaAutosize
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder={
              t('insight_instruction_placeholder') ||
              'Any specific requirements? (Optional)'
            }
            className="w-full bg-white border border-zinc-200 rounded-lg p-2.5 text-xs text-zinc-700 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 outline-none transition-all resize-none shadow-sm"
            minRows={2}
            maxRows={5}
          />
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t('confirm_send')}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

function IconSelector({ current, onSelect }: { current: FindingSentiment; onSelect: (key: FindingSentiment) => void }) {
    const [isOpen, setIsOpen] = useState(false)
    const currentConfig = SENTIMENT_ICONS[current] || SENTIMENT_ICONS.neutral
    const CurrentIcon = currentConfig.icon

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all bg-white border border-zinc-200 shadow-sm",
                    isOpen ? "ring-2 ring-indigo-100 border-indigo-300" : "hover:border-indigo-200"
                )}
            >
                <CurrentIcon className={cn("w-4 h-4", currentConfig.color)} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl p-1.5 grid grid-cols-4 gap-1 z-50 animate-in fade-in zoom-in-95 duration-100 min-w-[140px]">
                        {Object.entries(SENTIMENT_ICONS).map(([key, config]) => {
                            const Icon = config.icon
                            return (
                                <button
                                    key={key}
                                    onClick={() => {
                                        onSelect(key as FindingSentiment)
                                        setIsOpen(false)
                                    }}
                                    className={cn(
                                        "p-2 rounded-lg transition-colors flex items-center justify-center",
                                        current === key ? "bg-indigo-50" : "hover:bg-zinc-50"
                                    )}
                                    title={config.label}
                                >
                                    <Icon className={cn("w-4 h-4", config.color)} />
                                </button>
                            )
                        })}
                    </div>
                </>
            )}
        </div>
    )
}

function InsightSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border border-indigo-100 bg-white rounded-xl overflow-hidden shadow-sm',
        className
      )}
    >
      <div className="w-full flex items-center justify-between px-4 py-3 border-b border-zinc-50/50">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-indigo-100 animate-pulse" />
          <div className="h-4 w-24 bg-indigo-100 rounded animate-pulse" />
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-full bg-zinc-100 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-zinc-100 rounded animate-pulse" />
        </div>

        <div className="space-y-3">
          <div className="h-3 w-20 bg-zinc-100 rounded animate-pulse mb-2" />
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3 px-1">
              <div className="w-4 h-4 rounded bg-zinc-100 shrink-0 animate-pulse mt-1" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-full bg-zinc-100 rounded animate-pulse" />
                <div className="h-3 w-5/6 bg-zinc-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 bg-emerald-50/30 rounded-lg border border-emerald-50">
          <div className="flex gap-3">
            <div className="w-4 h-4 rounded-full bg-emerald-100 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2 py-0.5">
              <div className="h-3 w-full bg-emerald-100/50 rounded animate-pulse" />
              <div className="h-3 w-2/3 bg-emerald-100/50 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
