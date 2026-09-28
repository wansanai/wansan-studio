import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  Loader2,
  Tag,
  FileSpreadsheet,
  Table2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ReviewLayout } from './review/ReviewLayout'
import { SemanticReviewPanel } from './review/SemanticReviewPanel'
import { ColumnSemantic, FileNode, SemanticAnalysisResult } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { getVisibleColumns, isSystemColumn } from '@shared/utils/schema-utils'

type ReviewColumn = ColumnSemantic & { confidence?: number }
type ReviewMetric = NonNullable<SemanticAnalysisResult['metrics']>[number] & { confidence?: number }

interface SemanticReviewModalProps {
  isOpen: boolean
  file: FileNode | null
  onCancel: () => void
  onStartAnalysis: () => void
  onConfirm: (data: {
    selectedColumns: Record<string, ColumnSemantic>
    selectedMetrics: ReviewMetric[]
  }) => void
  isAnalyzing: boolean
  result: SemanticAnalysisResult | null
}

export function SemanticReviewModal({
  isOpen,
  file,
  onCancel,
  onStartAnalysis,
  onConfirm,
  isAnalyzing,
  result,
}: SemanticReviewModalProps) {
  const { t } = useTranslation(['common', 'analysis'])
  const [activeTab, setActiveTab] = useState<'columns' | 'metrics'>('columns')
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set())
  const [selectedMetrics, setSelectedMetrics] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (isOpen && result && file) {
      const colKeys = new Set<string>()
      Object.entries(result.columns).forEach(([key, rawData]) => {
        const data = rawData as ReviewColumn
        // [V1.7.5] Safety: Ignore system columns in AI response
        if (isSystemColumn(key)) return

        const existing = file.columns.find(c => c.name === key)?.semantic
        
        // Logic for auto-selecting AI suggestions:
        // 1. If confidence is very high (> 0.9)
        // 2. AND (it's a brand new suggestion OR user hasn't manually edited much)
        // For simplicity: auto-select if confidence > 0.8 AND it's not a conflicting manual edit
        const hasConflict = existing && (
          (existing.aliases && existing.aliases.length > 0 && JSON.stringify(existing.aliases) !== JSON.stringify(data.aliases)) ||
          (existing.description && existing.description !== data.description)
        )

        if (data.confidence > 0.8 && !hasConflict) {
          colKeys.add(key)
        }
      })
      setSelectedColumns(colKeys)

      const metricIndices = new Set<number>()
      ;(result.metrics || []).forEach((metric, i) => {
        const m = metric as ReviewMetric
        // Check if a metric with same name already exists
        const exists = (file.smartMetrics || []).some(em => em.name === m.name)
        if (!exists && (m.confidence === undefined || m.confidence > 0.8)) {
          metricIndices.add(i)
        }
      })
      setSelectedMetrics(metricIndices)
      
      if (Object.keys(result.columns).length > 0) setActiveTab('columns')
      else if ((result.metrics || []).length > 0) setActiveTab('metrics')
    }
  }, [isOpen, result, file])

  const handleConfirm = () => {
    if (!result) return
    const filteredColumns: Record<string, ColumnSemantic> = {}
    selectedColumns.forEach(colName => {
      filteredColumns[colName] = result.columns[colName]
    })

    onConfirm({
      selectedColumns: filteredColumns,
      selectedMetrics: (result.metrics || []).filter((_, i) => selectedMetrics.has(i)),
    })
  }

  const toggleColumn = (colName: string) => {
    const next = new Set(selectedColumns)
    if (next.has(colName)) next.delete(colName)
    else next.add(colName)
    setSelectedColumns(next)
  }

  const toggleMetric = (idx: number) => {
    const next = new Set(selectedMetrics)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setSelectedMetrics(next)
  }

  // 1. Loading State
  if (isOpen && isAnalyzing) {
    return (
      <ReviewLayout
        isOpen={isOpen}
        onClose={onCancel}
        headerIcon={<Loader2 className="w-6 h-6 text-zinc-900 animate-spin" />}
        title={t('analysis:analyzing_semantics_title')}
        description={file?.name}
        footer={null}
      >
        <div className="flex flex-col items-center justify-center py-20 gap-10">
          <div className="relative w-24 h-24 rounded-[3rem] bg-white flex items-center justify-center border border-zinc-100 shadow-sm">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full border-4 border-dashed border-indigo-100 animate-[spin_10s_linear_infinite] opacity-50" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
          </div>
        </div>
      </ReviewLayout>
    )
  }

  // 2. Pending State (Pre-analysis confirmation)
  if (isOpen && !isAnalyzing && !result && file) {
    const visibleCols = getVisibleColumns(file.columns)

    return (
      <ReviewLayout
        isOpen={isOpen}
        onClose={onCancel}
        headerIcon={<Tag className="w-6 h-6 text-zinc-900" />}
        title={`激活 "${file.name}"`}
        description="业务语义增强"
        footer={null}
      >
        <div className="flex flex-col items-center text-center p-10 py-12 space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 rounded-[2.5rem] bg-indigo-50 text-indigo-500 flex items-center justify-center shadow-inner border border-indigo-100/50">
            <FileSpreadsheet className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">准备揭开数据背后的业务逻辑</h3>
            <p className="text-zinc-500 font-medium max-w-sm mx-auto text-sm">AI 将尝试自动识别字段属性并推荐计算指标。</p>
          </div>

          {/* Schema Preview Card */}
          <div className="w-full max-w-md bg-white/50 rounded-[2rem] border border-zinc-100 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-zinc-400" />
                <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">数据表结构快照</span>
              </div>
              <Badge variant="secondary" className="bg-zinc-100 text-zinc-500 border-none font-bold text-[10px]">
                {visibleCols.length} 个字段 • {file.rowCount?.toLocaleString()} 行
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-left">
              {visibleCols.slice(0, 6).map((col, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white border border-zinc-100 rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-200 shrink-0" />
                  <span className="text-[11px] font-bold text-zinc-600 truncate" title={col.name}>{col.name}</span>
                </div>
              ))}
              {visibleCols.length > 6 && (
                <div className="col-span-2 text-center pt-1">
                  <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-tighter">以及另外 {visibleCols.length - 6} 个字段...</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 w-full max-w-sm pt-4">
            <Button variant="outline" onClick={onCancel} className="flex-1 h-14 rounded-2xl font-bold border-zinc-200 text-zinc-400 hover:text-zinc-900 transition-all">暂不分析</Button>
            <Button onClick={onStartAnalysis} className="flex-[1.5] h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-xl shadow-indigo-100 active:scale-95 group">立即分析 <Sparkles className="w-5 h-5 ml-2 fill-current group-hover:rotate-12 transition-transform" /></Button>
          </div>
        </div>
      </ReviewLayout>
    )
  }

  if (!result || !file) return null

  // 3. Review State (Analysis complete)
  return (
    <ReviewLayout
      isOpen={isOpen}
      onClose={onCancel}
      headerIcon={<Sparkles className="w-6 h-6 text-zinc-900 fill-current" />}
      title={file.name}
      description={t('analysis:review_semantics_desc')}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} className="rounded-xl font-black text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-900">
            {t('common:cancel')}
          </Button>
          <div className="flex items-center gap-4">
            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter">
              已选 {selectedColumns.size + selectedMetrics.size} 项元数据
            </div>
            <Button onClick={handleConfirm} className="h-14 px-10 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-2xl shadow-indigo-200 transition-all active:scale-95">
              {t('common:save')}
            </Button>
          </div>
        </>
      }
    >
      <SemanticReviewPanel
        file={file}
        result={result}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedColumns={selectedColumns}
        onToggleColumn={toggleColumn}
        selectedMetrics={selectedMetrics}
        onToggleMetric={toggleMetric}
        renderSidebar={(tabs) => (
          <div className="flex flex-col gap-1">{tabs}</div>
        )}
      />
    </ReviewLayout>
  )
}
