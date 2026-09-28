import React, { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Tag,
  Calculator,
  ArrowRight,
  CheckCircle2,
  Table2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'

import { ColumnSemantic, FileNode, SemanticAnalysisResult } from '@shared/types'

type ReviewColumn = ColumnSemantic & { confidence?: number }
type ReviewMetric = NonNullable<SemanticAnalysisResult['metrics']>[number] & { confidence?: number }

interface SemanticReviewPanelProps {
  file: FileNode
  result: SemanticAnalysisResult
  selectedColumns: Set<string>
  onToggleColumn: (colName: string) => void
  selectedMetrics: Set<number>
  onToggleMetric: (idx: number) => void
  // Controls
  activeTab?: 'columns' | 'metrics'
  onTabChange?: (tab: 'columns' | 'metrics') => void
  // UI Customization
  renderSidebar?: (tabs: React.ReactNode) => React.ReactNode
}

export function SemanticReviewPanel({
  file,
  result,
  selectedColumns,
  onToggleColumn,
  selectedMetrics,
  onToggleMetric,
  activeTab: externalTab,
  onTabChange,
  renderSidebar,
}: SemanticReviewPanelProps) {
  const { t } = useTranslation(['common', 'analysis'])
  const [internalTab, setInternalTab] = useState<'columns' | 'metrics'>('columns')
  
  const activeTab = externalTab || internalTab
  const setActiveTab = onTabChange || setInternalTab

  const tabs = (
    <>
      <button
        onClick={() => setActiveTab('columns')}
        className={cn(
          'mx-3 px-5 py-4 rounded-2xl text-xs font-bold uppercase tracking-widest flex items-center justify-between transition-all outline-none',
          activeTab === 'columns' ? 'bg-white shadow-lg shadow-zinc-200/50 text-indigo-600 scale-105' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100/50'
        )}
      >
        <div className="flex items-center gap-2"><Tag className="w-4 h-4" />{t('common:columns')}</div>
        <Badge variant="secondary" className={cn("ml-2 border-none px-1.5 h-5 font-bold tabular-nums", activeTab === 'columns' ? "bg-indigo-500 text-white" : "bg-zinc-200 text-zinc-500")}>
          {selectedColumns.size}/{Object.keys(result.columns).length}
        </Badge>
      </button>
      <button
        onClick={() => setActiveTab('metrics')}
        className={cn(
          'mx-3 px-5 py-4 rounded-2xl text-xs font-bold uppercase tracking-widest flex items-center justify-between transition-all outline-none',
          activeTab === 'metrics' ? 'bg-white shadow-lg shadow-zinc-200/50 text-indigo-600 scale-105' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100/50'
        )}
      >
        <div className="flex items-center gap-2"><Calculator className="w-4 h-4" />{t('analysis:smart_metrics')}</div>
        <Badge variant="secondary" className={cn("ml-2 border-none px-1.5 h-5 font-bold tabular-nums", activeTab === 'metrics' ? "bg-indigo-500 text-white" : "bg-zinc-200 text-zinc-500")}>
          {selectedMetrics.size}/{(result.metrics || []).length}
        </Badge>
      </button>
    </>
  )

  return (
    <div className="flex h-full">
      {renderSidebar && <div className="w-[200px] flex-shrink-0 border-r border-zinc-100 flex flex-col py-4 gap-1 bg-zinc-50/20">{renderSidebar(tabs)}</div>}
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#fcfcfc]">
        {activeTab === 'columns' ? (
          <div className="grid gap-2">
            {Object.entries(result.columns).map(([colName, rawData]) => {
              const data = rawData as ReviewColumn
              const existing = file.columns.find(c => c.name === colName)?.semantic
              const hasDiff = existing && (
                (existing.aliases && existing.aliases.length > 0 && JSON.stringify(existing.aliases) !== JSON.stringify(data.aliases)) ||
                (existing.description && existing.description !== data.description)
              )

              return (
                <div 
                  key={colName} 
                  className={cn(
                    "group flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer bg-white shadow-sm hover:shadow-md w-full overflow-hidden", 
                    selectedColumns.has(colName) ? "border-indigo-200 ring-1 ring-indigo-50" : "border-zinc-100 hover:border-zinc-200",
                    hasDiff && !selectedColumns.has(colName) && "border-amber-100 bg-amber-50/10"
                  )} 
                  onClick={() => onToggleColumn(colName)}
                >
                  <div className={cn("w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0", selectedColumns.has(colName) ? "bg-indigo-500 border-indigo-500" : "border-zinc-200")}>
                    {selectedColumns.has(colName) && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm font-bold text-zinc-900 truncate max-w-[120px]" title={colName}>{colName}</span>
                        <ArrowRight className="w-3 h-3 text-zinc-300 shrink-0" />
                        <span className="text-sm font-bold text-indigo-600 truncate max-w-[180px]" title={data.aliases?.join(', ') || colName}>
                          {data.aliases && data.aliases.length > 0 ? data.aliases.join(', ') : colName}
                        </span>
                        <div className="flex items-center gap-1.5 ml-1 shrink-0">
                          <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter bg-zinc-800 text-white border-none py-0 h-4">{data.businessType}</Badge>
                          <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-tighter bg-zinc-100 border-none text-zinc-500 py-0 h-4">{data.usageType}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasDiff && (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none text-[8px] font-black uppercase py-0 h-4">Update Proposed</Badge>
                        )}
                        {data.confidence !== undefined && (
                          <span className={cn('text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 w-fit', data.confidence > 0.8 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100')}>
                            {Math.round(data.confidence * 100)}% MATCH
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 space-y-1">
                      {hasDiff && existing?.description && (
                        <p className="text-[9px] text-zinc-400 line-through opacity-50 decoration-zinc-300">Current: {existing.description}</p>
                      )}
                      <p className="text-[10px] text-zinc-400 font-medium truncate italic opacity-80" title={data.description}>
                        {data.description || t('analysis:no_description_provided')}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid gap-3">
            {(result.metrics || []).map((metric, i: number) => {
              const m = metric as ReviewMetric
              const exists = (file.smartMetrics || []).some(em => em.name === m.name)
              return (
                <div 
                  key={i} 
                  className={cn(
                    "group flex items-start gap-4 p-4 rounded-[1.5rem] border transition-all cursor-pointer bg-white shadow-sm hover:shadow-md", 
                    selectedMetrics.has(i) ? "border-indigo-200 ring-1 ring-indigo-50" : "border-zinc-100 hover:border-zinc-200",
                    exists && !selectedMetrics.has(i) && "opacity-60 grayscale-[0.5]"
                  )} 
                  onClick={() => onToggleMetric(i)}
                >
                  <div className={cn("mt-1 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0", selectedMetrics.has(i) ? "bg-indigo-500 border-indigo-500" : "border-zinc-200")}>
                    {selectedMetrics.has(i) && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-zinc-900">{m.name}</h4>
                        {exists && <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-zinc-100 text-zinc-400 border-none font-bold uppercase">Exists</Badge>}
                      </div>
                      {m.confidence !== undefined && <span className={cn('text-[9px] font-black px-2 py-0.5 rounded-full border', m.confidence > 0.8 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100')}>{Math.round(m.confidence * 100)}%</span>}
                    </div>
                    <p className="text-[10px] text-zinc-500 font-medium leading-tight">{m.description}</p>
                    <div className="bg-zinc-900/95 rounded-xl p-3 shadow-inner overflow-hidden border border-zinc-800">
                      <code className="text-[10px] text-indigo-300 font-mono break-all leading-normal opacity-90">{m.sqlExpression}</code>
                    </div>
                  </div>
                </div>
              )
            })}
            {(result.metrics || []).length === 0 && (
               <div className="h-full flex flex-col items-center justify-center text-zinc-300 py-20 opacity-50">
                  <Table2 className="w-16 h-16 mb-4" />
                  <p className="text-sm font-black uppercase tracking-widest">{t('analysis:no_metric_suggestions')}</p>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}