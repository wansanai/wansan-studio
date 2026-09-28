import { useEffect, useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  ArrowRight,
  Loader2,
  Tag,
  Zap,
  GitMerge,
  ChevronRight,
  CheckCircle2,
  FileSpreadsheet,
  Table2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import {
  ColumnSemantic,
  ContextAnalysisResult,
  FileNode,
  RelationSuggestion,
  SemanticAnalysisResult,
} from '@shared/types'
import { getVisibleColumns } from '@shared/utils/schema-utils'
import { useProjectStore } from '@/stores/useProjectStore'
import { ReviewLayout } from './review/ReviewLayout'
import { SemanticReviewPanel } from './review/SemanticReviewPanel'
import { ContextReviewPanel } from './review/ContextReviewPanel'
import { Badge } from '@/components/ui/badge'

interface AnalysisReviewModalProps {
  isOpen: boolean
  onCancel: () => void
  onConfirm: (data: {
    selectedRelations: RelationSuggestion[]
    selectedPrompts: string[]
  }) => void
  onStartAnalysis: () => void
  isAnalyzing: boolean
  result: ContextAnalysisResult | null
}

export function AnalysisReviewModal({
  isOpen,
  onCancel,
  onConfirm,
  onStartAnalysis,
  isAnalyzing,
  result,
}: AnalysisReviewModalProps) {
  const { t, i18n } = useTranslation(['chat', 'common', 'analysis'])
  const { files, updateColumnSemantic, addSmartMetric } = useProjectStore()

  // --- GLOBAL STATE ---
  const [onboardingStep, setOnboardingStep] = useState<
    'intro' | 'pending-semantic' | 'analyzing-semantic' | 'review-semantic' | 'ready-for-context' | 'context' | 'complete'
  >('intro')

  // --- SEMANTIC LOOP STATE ---
  const [semanticQueue, setSemanticQueue] = useState<FileNode[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
type ReviewColumn = ColumnSemantic & { confidence?: number }
type ReviewMetric = NonNullable<SemanticAnalysisResult['metrics']>[number] & { confidence?: number }

  const [currentSemanticResult, setCurrentSemanticResult] =
    useState<SemanticAnalysisResult | null>(null)
  
  const [activeSemanticTab, setActiveSemanticTab] = useState<'columns' | 'metrics'>('columns')
  const [selectedSemColumns, setSelectedSemColumns] = useState<Set<string>>(new Set())
  const [selectedSemMetrics, setSelectedSemMetrics] = useState<Set<number>>(new Set())

  // --- CONTEXT REVIEW STATE ---
  const [activeContextTab, setActiveContextTab] = useState<'relations' | 'prompts'>('relations')
  const [selectedRelations, setSelectedRelations] = useState<Set<number>>(new Set())
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set())

  // --- ASSET SCANNING ---
  const unAnalyzedFiles = useMemo(() => {
    return files.filter(f => 
        f.status === 'ready' && 
        f.columns.every(c => !c.semantic?.description) &&
        (!f.smartMetrics || f.smartMetrics.length === 0)
    )
  }, [files])

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!isOpen) {
      setOnboardingStep('intro')
      setSemanticQueue([])
      setCurrentIndex(0)
      setCurrentSemanticResult(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && result && onboardingStep !== 'complete') {
      const relIndices = new Set<number>()
      result.relationships.forEach((r, i) => {
        if (r.confidence > 0.8) relIndices.add(i)
      })
      setSelectedRelations(relIndices)
      setSelectedPrompts(new Set(result.suggestedPrompts))
      if (result.relationships.length > 0) setActiveContextTab('relations')
      else setActiveContextTab('prompts')
      setOnboardingStep('complete')
    }
  }, [isOpen, result, onboardingStep])

  // --- ACTIONS ---
  const startSemanticFlow = () => {
    if (unAnalyzedFiles.length === 0) {
      setOnboardingStep('ready-for-context')
      return
    }
    setSemanticQueue(unAnalyzedFiles)
    setCurrentIndex(0)
    setOnboardingStep('pending-semantic')
  }

  const handleStartAnalysis = async () => {
    const file = semanticQueue[currentIndex]
    if (!file) return
    setOnboardingStep('analyzing-semantic')
    const language = i18n.language?.startsWith('zh') ? 'zh' : 'en'
    try {
      const visibleCols = getVisibleColumns(file.columns)
      const aiRes = await window.electronAPI.analyzeSemantics({
        tableName: file.tableName, columns: visibleCols, language
      })
      if (aiRes.success && aiRes.data) {
        setCurrentSemanticResult(aiRes.data)
        const colKeys = new Set<string>()
        Object.entries(aiRes.data.columns).forEach(([key, rawData]) => {
          const data = rawData as ReviewColumn
          if (!data.confidence || data.confidence > 0.8) colKeys.add(key)
        })
        setSelectedSemColumns(colKeys)
        const metricIndices = new Set<number>()
        ;(aiRes.data.metrics || []).forEach((metric, i: number) => {
          const m = metric as ReviewMetric
          if (m.confidence === undefined || m.confidence > 0.8) metricIndices.add(i)
        })
        setSelectedSemMetrics(metricIndices)
        setActiveSemanticTab(Object.keys(aiRes.data.columns).length > 0 ? 'columns' : 'metrics')
        setOnboardingStep('review-semantic')
      } else {
        handleSemanticNext()
      }
    } catch (e) {
      console.error(e)
      handleSemanticNext()
    }
  }

  const handleSemanticConfirm = async () => {
    const file = semanticQueue[currentIndex]
    if (!file || !currentSemanticResult) return
    for (const colName of Array.from(selectedSemColumns)) {
      const semantic = currentSemanticResult.columns[colName]
      if (semantic) updateColumnSemantic(file.id, colName, semantic)
    }
    if (currentSemanticResult.metrics) {
      for (const idx of Array.from(selectedSemMetrics)) {
        const m = currentSemanticResult.metrics[idx] as ReviewMetric
        await addSmartMetric(file.id, {
          id: crypto.randomUUID(), name: m.name, sqlExpression: m.sqlExpression, description: m.description
        })
      }
    }
    handleSemanticNext()
  }

  const handleSemanticSkip = () => {
    handleSemanticNext()
  }

  const handleSemanticNext = () => {
    const nextIndex = currentIndex + 1
    if (nextIndex < semanticQueue.length) {
      setCurrentIndex(nextIndex)
      setOnboardingStep('pending-semantic')
    } else {
      setOnboardingStep('ready-for-context')
    }
  }

  const handleStartContext = () => {
    setOnboardingStep('context')
    onStartAnalysis()
  }

  // --- PROGRESS ---
  const globalProgress = useMemo(() => {
    const totalSteps = semanticQueue.length + (onboardingStep === 'intro' ? 0 : 1)
    const currentPos = onboardingStep === 'complete' ? totalSteps : currentIndex + 1
    return (currentPos / (totalSteps || 1)) * 100
  }, [onboardingStep, currentIndex, semanticQueue.length])

  // --- RENDERING STATES ---

  if (onboardingStep === 'intro') {
    const hasPending = unAnalyzedFiles.length > 0
    return (
      <ReviewLayout
        isOpen={isOpen} onClose={onCancel}
        headerIcon={<Sparkles className="w-6 h-6 text-zinc-900 fill-current" />}
        title={t('chat:modeling_onboarding_title')}
        description={hasPending ? t('chat:modeling_onboarding_desc') : "资产扫描已就绪"}
        footer={null}
      >
        <div className="space-y-10 px-10 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
          <div className="bg-white rounded-2xl p-6 border border-zinc-100 flex items-center justify-between shadow-sm text-left">
            <div className="flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shadow-sm", hasPending ? "bg-amber-50 text-amber-500" : "bg-emerald-50 text-emerald-500")}>
                {hasPending ? <Tag className="w-6 h-6" /> : <GitMerge className="w-6 h-6" />}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">资产扫描状态</span>
                <span className="text-sm font-bold text-zinc-900">{hasPending ? `检测到 ${unAnalyzedFiles.length} 张待激活的新表` : "所有表已具备业务语义"}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 opacity-80 text-left">
            <div className="flex flex-col gap-4 p-6 rounded-2xl border border-zinc-100 bg-white group border-b-4 border-b-indigo-50 shadow-sm">
              <Tag className="w-6 h-6 text-indigo-500" /><h4 className="font-bold text-sm text-zinc-900">{t('chat:step_semantics_title')}</h4>
            </div>
            <div className="flex flex-col gap-4 p-6 rounded-2xl border border-zinc-100 bg-white group border-b-4 border-b-amber-50 shadow-sm">
              <GitMerge className="w-6 h-6 text-amber-500" /><h4 className="font-bold text-sm text-zinc-900">{t('chat:step_context_title')}</h4>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {hasPending ? (
              <>
                <Button onClick={startSemanticFlow} className="w-full h-16 bg-zinc-900 hover:bg-black text-white font-black text-lg rounded-xl shadow-xl active:scale-95 group">
                  <span>开始激活数据表 ({unAnalyzedFiles.length})</span><ChevronRight className="w-6 h-6 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button variant="ghost" onClick={handleStartContext} className="w-full h-12 text-zinc-400 hover:text-zinc-900 font-bold rounded-lg transition-colors">跳过语义，直接探索洞察</Button>
              </>
            ) : (
              <Button onClick={handleStartContext} className="w-full h-16 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg rounded-xl shadow-xl active:scale-95 group">
                <span>立即开始关联与洞察分析</span><ArrowRight className="w-6 h-6 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            )}
          </div>
        </div>
      </ReviewLayout>
    )
  }

  if (onboardingStep === 'pending-semantic') {
    const file = semanticQueue[currentIndex]
    return (
      <ReviewLayout
        isOpen={isOpen} onClose={onCancel} progress={globalProgress}
        headerIcon={<Tag className="w-6 h-6 text-zinc-900" />}
        title={`激活 "${file?.name}"`}
        description={`步骤 ${currentIndex + 1} / ${semanticQueue.length}`}
        footer={null}
      >
        <div className="flex flex-col items-center text-center p-10 py-12 space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center shadow-inner border border-indigo-100/50"><FileSpreadsheet className="w-9 h-9" /></div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">准备揭开数据背后的业务逻辑</h3>
            <p className="text-zinc-500 font-medium max-w-sm mx-auto text-sm">AI 将尝试自动识别字段属性并推荐计算指标。</p>
          </div>

          {/* Schema Preview Card */}
          {file && (
            <div className="w-full max-w-md bg-white/50 rounded-2xl border border-zinc-100 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-zinc-400" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">数据表结构快照</span>
                </div>
                <Badge variant="secondary" className="bg-zinc-100 text-zinc-500 border-none font-bold text-[10px]">
                  {file.columns.length} 个字段 • {file.rowCount?.toLocaleString()} 行
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-left">
                {file.columns.slice(0, 6).map((col, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white border border-zinc-100 rounded-lg shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-200 shrink-0" />
                    <span className="text-[11px] font-bold text-zinc-600 truncate" title={col.name}>{col.name}</span>
                  </div>
                ))}
                {file.columns.length > 6 && (
                  <div className="col-span-2 text-center pt-1">
                    <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-tighter">以及另外 {file.columns.length - 6} 个字段...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-4 w-full max-w-sm pt-4">
            <Button variant="outline" onClick={handleSemanticSkip} className="flex-1 h-14 rounded-xl font-bold border-zinc-200 text-zinc-400 hover:text-zinc-900 transition-all">暂不分析</Button>
            <Button onClick={handleStartAnalysis} className="flex-[1.5] h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-xl shadow-indigo-100 active:scale-95 group">立即分析 <Sparkles className="w-5 h-5 ml-2 fill-current group-hover:rotate-12 transition-transform" /></Button>
          </div>
        </div>
      </ReviewLayout>
    )
  }

  if (onboardingStep === 'analyzing-semantic') {
    return (
      <ReviewLayout
        isOpen={isOpen} onClose={onCancel} progress={globalProgress}
        headerIcon={<Loader2 className="w-6 h-6 text-zinc-900 animate-spin" />}
        title="AI 分析中..." description={semanticQueue[currentIndex]?.name}
        footer={null}
      >
        <div className="flex flex-col items-center justify-center py-20 gap-10">
          <div className="relative w-24 h-24 rounded-2xl bg-white flex items-center justify-center border border-zinc-100 shadow-sm">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center"><div className="w-32 h-32 rounded-full border-4 border-dashed border-indigo-100 animate-[spin_10s_linear_infinite] opacity-50" /></div>
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

  if (onboardingStep === 'review-semantic' && currentSemanticResult) {
    const file = semanticQueue[currentIndex]
    return (
      <ReviewLayout
        isOpen={isOpen} onClose={onCancel} progress={globalProgress}
        headerIcon={<CheckCircle2 className="w-6 h-6 text-zinc-900" />}
        title={file.name}
        description={`核对 AI 建议的语义与指标 (${currentIndex + 1}/${semanticQueue.length})`}
        footer={
          <>
            <Button variant="ghost" onClick={handleSemanticNext} className="rounded-xl font-bold text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-900">跳过此表</Button>
            <div className="flex items-center gap-4">
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter">已选 {selectedSemColumns.size + selectedSemMetrics.size} 项建议</div>
              <Button onClick={handleSemanticConfirm} className="h-14 px-10 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-xl shadow-indigo-100 transition-all active:scale-95">确认并应用</Button>
            </div>
          </>
        }
      >
        <SemanticReviewPanel
          file={file}
          result={currentSemanticResult}
          selectedColumns={selectedSemColumns}
          onToggleColumn={(name) => {
            const next = new Set(selectedSemColumns); if (next.has(name)) next.delete(name); else next.add(name); setSelectedSemColumns(next)
          }}
          selectedMetrics={selectedSemMetrics}
          onToggleMetric={(idx) => {
            const next = new Set(selectedSemMetrics); if (next.has(idx)) next.delete(idx); else next.add(idx); setSelectedSemMetrics(next)
          }}
          activeTab={activeSemanticTab} onTabChange={setActiveSemanticTab}
          renderSidebar={(tabs) => <div className="flex flex-col gap-1">{tabs}</div>}
        />
      </ReviewLayout>
    )
  }

  if (onboardingStep === 'ready-for-context') {
    return (
      <ReviewLayout
        isOpen={isOpen} onClose={onCancel} progress={100}
        headerIcon={<GitMerge className="w-6 h-6 text-zinc-900" />}
        title="语义激活已就绪"
        description="进入最后一步：建立表关联"
        footer={null}
      >
        <div className="p-10 py-12 flex flex-col items-center text-center space-y-10 animate-in fade-in zoom-in duration-500">
          <div className="relative w-24 h-24 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-sm border border-emerald-100 animate-pulse"><GitMerge className="w-10 h-10" /></div>
          <div className="space-y-3">
            <h3 className="text-3xl font-bold text-zinc-900 tracking-tight">扫描跨表关联与洞察</h3>
            <p className="text-zinc-500 font-medium max-w-sm mx-auto leading-relaxed">AI 将根据当前的语义模型，寻找表之间的主外键关联，并生成探索建议。</p>
          </div>
          <div className="flex gap-4 w-full max-w-sm pt-4">
            <Button variant="outline" onClick={onCancel} className="flex-1 h-14 rounded-xl font-bold text-zinc-400 border-zinc-200 hover:bg-zinc-50 transition-all">直接结束</Button>
            <Button onClick={handleStartContext} className="flex-[1.5] h-14 rounded-2xl bg-zinc-900 hover:bg-black text-white font-black shadow-xl active:scale-95 group">开始扫描 <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" /></Button>
          </div>
        </div>
      </ReviewLayout>
    )
  }

  if ((onboardingStep === 'context' || isAnalyzing) && onboardingStep !== 'complete') {
    return (
      <ReviewLayout
        isOpen={isOpen} onClose={onCancel} progress={100}
        headerIcon={<Loader2 className="w-6 h-6 text-zinc-900 animate-spin" />}
        title="正在建立关联模型..."
        description="这通常需要几秒钟"
        footer={null}
      >
        <div className="flex flex-col items-center justify-center py-20 gap-10">
          <div className="relative w-24 h-24 rounded-2xl bg-white flex items-center justify-center border border-zinc-100 shadow-sm">
            <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center"><div className="w-32 h-32 rounded-full border-4 border-dashed border-amber-100 animate-[spin_12s_linear_infinite] opacity-50" /></div>
          </div>
        </div>
      </ReviewLayout>
    )
  }

  if (onboardingStep === 'complete' && result) {
    return (
      <ReviewLayout
        isOpen={isOpen} onClose={onCancel} progress={100}
        headerIcon={<Zap className="w-6 h-6 text-zinc-900 fill-current" />}
        title={t('chat:review_analysis_title')}
        description="最后一步：确认关联关系与探索建议"
        footer={
          <>
            <Button variant="ghost" onClick={onCancel} className="rounded-xl font-black text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-900">{t('common:cancel')}</Button>
            <div className="flex items-center gap-4">
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter">已选 {selectedRelations.size + selectedPrompts.size} 项模型定义</div>
              <Button onClick={() => onConfirm({ selectedRelations: result.relationships.filter((_, i) => selectedRelations.has(i)), selectedPrompts: Array.from(selectedPrompts) })} className="h-14 px-10 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black shadow-xl shadow-amber-100 transition-all active:scale-95">完成激活</Button>
            </div>
          </>
        }
      >
        <ContextReviewPanel
          result={result}
          selectedRelations={selectedRelations}
          onToggleRelation={(idx) => { const next = new Set(selectedRelations); if (next.has(idx)) next.delete(idx); else next.add(idx); setSelectedRelations(next) }}
          selectedPrompts={selectedPrompts}
          onTogglePrompt={(p) => { const next = new Set(selectedPrompts); if (next.has(p)) next.delete(p); else next.add(p); setSelectedPrompts(next) }}
          activeTab={activeContextTab} onTabChange={setActiveContextTab}
          renderSidebar={(tabs) => <div className="flex flex-col gap-1">{tabs}</div>}
        />
      </ReviewLayout>
    )
  }

  return null
}
