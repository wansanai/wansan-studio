import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileNode,
  ColumnSchema,
  ColumnSemantic,
  SemanticAnalysisResult,
  SmartMetric,
} from '@shared/types'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Edit2, Eye, EyeOff, Key, Sparkles, RefreshCcw, Calculator, Trash2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getVisibleColumns } from '@shared/utils/schema-utils'
import { COLUMN_TYPE_CONFIG } from '@/src/lib/constants'
import { useProjectStore } from '@/stores/useProjectStore'
import { useToastStore } from '@/stores/useToastStore'
import { SemanticEditorModal } from '../modals/SemanticEditorModal'
import { AIExtractorDialog } from '../modals/AIExtractorDialog'
import { SemanticReviewModal } from '../modals/SemanticReviewModal'
import { MetricEditorModal } from '../modals/metric-editor-modal'
import { ConfirmDialog } from '../modals/ConfirmDialog'

interface ColumnsViewProps {
  file: FileNode
  initialExtractColumn?: ColumnSchema | null
}

type BatchCompletePayload = {
  tableName: string
  columnName: string
  targetColumnName: string
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

export function ColumnsView({ file, initialExtractColumn }: ColumnsViewProps) {
  const { t, i18n } = useTranslation(['common', 'analysis'])
  const toast = useToastStore()
  
  const updateColumnSemantic = useProjectStore(s => s.updateColumnSemantic)
  const refreshMetadata = useProjectStore(s => s.refreshFileMetadata)
  const addSmartMetric = useProjectStore(s => s.addSmartMetric)
  const removeSmartMetric = useProjectStore(s => s.removeSmartMetric)
  const removeColumn = useProjectStore(s => s.removeColumn)
  
  const [editingColumn, setEditingColumn] = useState<ColumnSchema | null>(null)
  const [aiExtractColumn, setAiExtractColumn] = useState<ColumnSchema | null>(initialExtractColumn || null)
  const [activeHint, setActiveHint] = useState<{ prompt: string; targetColumnName: string } | null>(null)

  const [showReviewModal, setShowReviewModal] = useState(false)
  const [analysisResult, setAnalysisResult] =
    useState<SemanticAnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Delete Confirmation State
  const [pendingDeleteCol, setPendingDeleteCol] = useState<string | null>(null)

  // Metric Editor State
  const [isMetricModalOpen, setIsMetricModalOpen] = useState(false)
  const [editingMetric, setEditingMetric] = useState<SmartMetric | undefined>(undefined)

  // Sync with prop change (for cross-tab trigger)
  React.useEffect(() => {
    if (initialExtractColumn) {
      setAiExtractColumn(initialExtractColumn)
    }
  }, [initialExtractColumn])

  // [V1.7.5] Auto-refresh when AI extraction completes
  React.useEffect(() => {
    const removeListener = window.electronAPI.onBatchComplete((data: BatchCompletePayload) => {
       if (data.tableName === file.tableName) {
          console.log('[ColumnsView] AI Batch Complete, refreshing metadata...')
          refreshMetadata(file.id)
       }
    })
    return () => {
      if (removeListener) removeListener()
    }
  }, [file.tableName, file.id, refreshMetadata])

  const handleEdit = (col: ColumnSchema) => {
    if (col.sourceType === 'metric') {
      const metric = (file.smartMetrics || []).find(m => m.name === col.name)
      if (metric) {
        setEditingMetric(metric)
        setIsMetricModalOpen(true)
      }
    } else {
      setEditingColumn(col)
    }
  }

  const handleAddMetric = () => {
    setEditingMetric(undefined)
    setIsMetricModalOpen(true)
  }

  const handleSaveMetric = async (metric: Omit<SmartMetric, 'id'>) => {
    const isNew = !editingMetric
    if (editingMetric) await removeSmartMetric(file.id, editingMetric.id)
    const newMetric: SmartMetric = {
      ...metric,
      id: editingMetric ? editingMetric.id : crypto.randomUUID(),
    }
    await addSmartMetric(file.id, newMetric)
    setIsMetricModalOpen(false)
    
    // Explicitly sync metadata to show the new metric in the list
    await refreshMetadata(file.id)

    toast.addToast({
      title: isNew ? t('metric_added') : t('metric_updated'),
      type: 'success',
    })
  }

  const handleDeleteConfirmed = async () => {
    if (!pendingDeleteCol) return
    await removeColumn(file.id, pendingDeleteCol)
    setPendingDeleteCol(null)
    toast.addToast({
      title: t('common:delete_success', 'Column deleted'),
      type: 'success',
    })
  }

  const handleOpenExtractor = (col: ColumnSchema, hint?: { prompt: string; targetColumnName: string }) => {
    setAiExtractColumn(col)
    setActiveHint(hint || null)
  }

  const handleSaveSemantic = (data: {
    aliases: string[]
    description: string
    businessType: string
    usageType?: ColumnSemantic['usageType']
    defaultAggregation?: ColumnSemantic['defaultAggregation']
  }) => {
    if (!editingColumn) return
    updateColumnSemantic(file.id, editingColumn.name, data)
    setEditingColumn(null)
    toast.addToast({
      title: t('semantic_updated', 'Metadata Updated'),
      type: 'success',
    })
  }

  const handleRunExtract = async (prompt: string, newColumnName: string, sourceColumn: string) => {
    if (!file) return
    
    try {
      const res = await window.electronAPI.aiBatchExtract({
        tableName: file.tableName,
        columnName: sourceColumn,
        targetColumnName: newColumnName,
        prompt
      })
      
      if (res.success) {
         toast.addToast({
            title: t('ai_job_started', 'Extraction Started'),
            description: t('ai_job_desc', 'AI is processing your data in the background.'),
            type: 'success',
          })
      } else {
         toast.addToast({
            title: t('ai_job_failed', 'Failed to start job'),
            description: res.error,
            type: 'error',
          })
      }
    } catch (e: unknown) {
        toast.addToast({
            title: 'Error',
            description: getErrorMessage(e),
            type: 'error',
          })
    }
  }

  const handleOpenSemanticReview = () => {
    setAnalysisResult(null)
    setShowReviewModal(true)
  }

  const handleAnalyzeSemantics = async () => {
    setIsAnalyzing(true)
    setAnalysisResult(null)

    try {
      const language = i18n.language?.startsWith('zh') ? 'zh' : 'en'
      const visibleColumns = getVisibleColumns(file.columns)
      
      const aiRes = await window.electronAPI.analyzeSemantics({
        tableName: file.tableName,
        columns: visibleColumns,
        language,
      })
      if (!aiRes.success || !aiRes.data)
        throw new Error(aiRes.error || 'AI analysis failed')

      setAnalysisResult(aiRes.data)
    } catch (e: unknown) {
      setShowReviewModal(false)
      toast.addToast({
        title: t('analysis_failed', 'Analysis Failed'),
        description: getErrorMessage(e),
        type: 'error',
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleApplySemanticReview = async (data: {
    selectedColumns: Record<string, ColumnSemantic>
    selectedMetrics: NonNullable<SemanticAnalysisResult['metrics']>
  }) => {
    const { selectedColumns, selectedMetrics } = data

    Object.entries(selectedColumns).forEach(([colName, semantic]) => {
      updateColumnSemantic(file.id, colName, semantic)
    })

    for (const m of selectedMetrics) {
      await addSmartMetric(file.id, {
        id: crypto.randomUUID(),
        name: m.name,
        sqlExpression: m.sqlExpression,
        description: m.description,
      })
      
      if (m.semantic) {
        updateColumnSemantic(file.id, m.name, m.semantic)
      }
    }

    await refreshMetadata(file.id)

    setShowReviewModal(false)
    toast.addToast({
      title: t('semantics_analysis_complete', 'Semantics Analysis Complete'),
      type: 'success',
    })
  }

  return (
    <>
      <div className="flex flex-col h-full bg-transparent relative">
        {/* Global Action Bar */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
           <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-50 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-none mb-1">
                  {t('ai_toolkit', 'AI Data Toolkit')}
                </h3>
                <p className="text-[10px] text-zinc-400 font-medium">
                  {t('ai_toolkit_desc', 'Enhance metadata and extract intelligence using AI')}
                </p>
              </div>
           </div>
           <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleOpenSemanticReview}
                disabled={isAnalyzing}
                className="rounded-xl border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all gap-2 h-9"
              >
                {isAnalyzing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span className="text-xs font-bold">{t('analyze_semantics', 'Analyze Semantics')}</span>
              </Button>

              <Button 
                variant="outline" 
                size="sm"
                onClick={handleAddMetric}
                className="rounded-xl border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all gap-2 h-9"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">{t('add_metric', 'Add Metric')}</span>
              </Button>

              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                    const visibleCols = getVisibleColumns(file.columns)
                    const col = aiExtractColumn || visibleCols[0]
                    setAiExtractColumn(col)
                }}
                className="rounded-xl border-purple-100 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-600 hover:text-white transition-all gap-2 h-9"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">{t('apply_extraction', 'Run AI Extract')}</span>
              </Button>
           </div>
        </div>

        <div className="px-6 py-6 overflow-y-auto flex-1">
          <div className="flex flex-col border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-50 dark:divide-zinc-800 z-0 relative shadow-sm">
            {getVisibleColumns(file.columns)
              .map(col => {
                const isVisible = col.semantic?.isVisibleToAI !== false
                const isAI = col.sourceType === 'ai'
                const isMetric = col.sourceType === 'metric'
              return (
                <div
                  key={col.name}
                  className={cn(
                    'group flex items-center gap-4 px-4 py-3 bg-white hover:bg-zinc-50/50 transition-colors',
                    !isVisible && 'opacity-60 bg-zinc-50/20',
                    isAI && 'bg-purple-50/20 hover:bg-purple-50/40 border-l-[3px] border-l-purple-400',
                    isMetric && 'bg-emerald-50/20 hover:bg-emerald-50/40 border-l-[3px] border-l-emerald-400'
                  )}
                >
                  <div className="w-16 shrink-0 flex items-center gap-1.5">
                    <div
                      className={cn(
                        'p-1.5 rounded-lg border transition-all',
                        col.isPrimaryKey
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                          : isAI 
                            ? 'bg-purple-100 border-purple-200 text-purple-600'
                            : isMetric
                              ? 'bg-emerald-100 border-emerald-200 text-emerald-600'
                              : 'bg-white border-zinc-100 text-zinc-200'
                      )}
                    >
                      {isAI ? (
                        <Sparkles className="w-3.5 h-3.5 fill-current" />
                      ) : isMetric ? (
                        <Calculator className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Key
                          className={cn(
                            'w-3.5 h-3.5',
                            col.isPrimaryKey && 'fill-current'
                          )}
                        />
                      )}
                    </div>
                    <button
                      onClick={() =>
                        updateColumnSemantic(file.id, col.name, {
                          isVisibleToAI: !isVisible,
                        })
                      }
                      className={cn(
                        'p-1.5 rounded-lg transition-all border',
                        isVisible
                          ? 'text-zinc-300 border-transparent hover:border-zinc-200 hover:text-indigo-600'
                          : 'text-red-500 bg-red-50 border-red-100'
                      )}
                    >
                      {isVisible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="w-48 shrink-0 flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="text-sm font-bold text-zinc-900 truncate block leading-none"
                        title={col.name}
                      >
                        {col.name}
                      </span>
                      {isAI && (
                         <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-purple-50 text-purple-600 border-purple-100 font-black uppercase tracking-tighter">
                            AI
                         </Badge>
                      )}
                      {isMetric && (
                         <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-emerald-50 text-emerald-600 border-emerald-100 font-black uppercase tracking-tighter">
                            Metric
                         </Badge>
                      )}
                    </div>
                    <span className="text-[9px] font-black uppercase text-zinc-400 tracking-tighter leading-none">
                      {COLUMN_TYPE_CONFIG[col.type]?.label
                        ? t(COLUMN_TYPE_CONFIG[col.type]?.label)
                        : col.type}
                    </span>
                  </div>
                  <div className="flex-1 flex items-center gap-6 min-w-0">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        {isMetric ? (
                          <code className="text-[10px] font-mono text-emerald-600 bg-emerald-50/50 px-1.5 py-0.5 rounded truncate max-w-xs">
                              {(file.smartMetrics || []).find(m => m.name === col.name)?.sqlExpression}
                          </code>
                        ) : col.semantic?.businessType && (
                          <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-tighter border border-indigo-100/50">
                            {col.semantic.businessType}
                          </span>
                        )}
                        {(col.semantic?.aliases || [])
                          .slice(0, 1)
                          .map((alias, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="bg-indigo-50/50 text-indigo-600 font-black border-indigo-100/50 text-[10px] px-2 py-0.5 rounded-lg"
                            >
                              {alias}
                            </Badge>
                          ))}
                        {(col.semantic?.aliases || []).length > 1 && (
                          <span className="text-[9px] text-zinc-400 font-bold ml-0.5">
                            +{(col.semantic?.aliases || []).length - 1} synonyms
                          </span>
                        )}
                      </div>
                      {col.semantic?.description && (
                        <p className="text-[10px] text-zinc-400 font-medium truncate italic opacity-80" title={col.semantic.description}>
                          {col.semantic.description}
                        </p>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-4 overflow-hidden opacity-50 group-hover:opacity-100 transition-all duration-300">
                      <div className="w-px h-3 bg-zinc-100 shrink-0" />
                      <div className="flex items-center gap-1.5 truncate">
                        {(col.sampleValues || [])
                          .slice(0, 3)
                          .map((val, i) => (
                            <span
                              key={i}
                              className="text-[10px] font-medium text-zinc-500 bg-zinc-100/50 px-2 py-0.5 rounded-md whitespace-nowrap tabular-nums"
                            >
                              {typeof val === 'object'
                                ? '{...}'
                                : String(val)}
                            </span>
                          ))}
                        {(col.sampleValues || []).length === 0 && (
                          <span className="text-[10px] italic text-zinc-300">
                            {t('no_samples')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="w-24 shrink-0 text-right opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1">
                    {/* [V1.7.5] AI Re-extract Button */}
                    {isAI && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenExtractor(col, { prompt: '', targetColumnName: col.name })}
                        title={t('re_extract', 'Re-extract / Refine')}
                        className="h-8 w-8 text-amber-600 hover:bg-amber-50 rounded-xl"
                      >
                        <RefreshCcw className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    {/* [V1.7] AI Extract Button */}
                    {col.semantic?.extractionHints && col.semantic.extractionHints.length > 0 ? (
                       <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenExtractor(col, col.semantic?.extractionHints?.[0])}
                        title={col.semantic.extractionHints[0].reason}
                        className="h-8 w-8 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl animate-pulse"
                      >
                        <Sparkles className="w-3.5 h-3.5 fill-current" />
                      </Button>
                    ) : (
                      !isMetric && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenExtractor(col)}
                            title={t('ai_extract_tooltip', 'AI Extract')}
                            className="h-8 w-8 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                        </Button>
                      )
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(col)}
                      className="h-8 w-8 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>

                    {/* [V1.7.5] Delete Button for non-raw fields */}
                    {(isAI || isMetric) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDeleteCol(col.name)}
                        className="h-8 w-8 text-zinc-300 hover:text-red-600 hover:bg-red-50 rounded-xl"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteCol}
        onOpenChange={(open) => !open && setPendingDeleteCol(null)}
        onConfirm={handleDeleteConfirmed}
        title={t('common:delete_field', 'Delete Column')}
        description={t('common:delete_field_desc', 'Are you sure you want to permanently delete this field? Data cannot be recovered.')}
        variant="destructive"
      />

      <SemanticEditorModal
        isOpen={!!editingColumn}
        onClose={() => setEditingColumn(null)}
        onSave={handleSaveSemantic}
        column={editingColumn}
      />

      <MetricEditorModal
        isOpen={isMetricModalOpen}
        onClose={() => setIsMetricModalOpen(false)}
        onSave={handleSaveMetric}
        initialMetric={editingMetric}
        file={file}
      />

      <AIExtractorDialog
        isOpen={!!aiExtractColumn}
        onClose={() => {
            setAiExtractColumn(null)
            setActiveHint(null)
        }}
        onRun={handleRunExtract}
        column={aiExtractColumn}
        columns={file.columns}
        tableName={file.tableName}
        initialPrompt={activeHint?.prompt}
        initialColumnName={activeHint?.targetColumnName}
      />

      <SemanticReviewModal
        isOpen={showReviewModal}
        file={file}
        isAnalyzing={isAnalyzing}
        result={analysisResult}
        onStartAnalysis={handleAnalyzeSemantics}
        onCancel={() => setShowReviewModal(false)}
        onConfirm={handleApplySemanticReview}
      />
    </>
  )
}
