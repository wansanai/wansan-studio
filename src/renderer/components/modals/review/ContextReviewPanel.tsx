import React, { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Link as LinkIcon,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import { ContextAnalysisResult } from '@shared/types'

interface ContextReviewPanelProps {
  result: ContextAnalysisResult
  selectedRelations: Set<number>
  onToggleRelation: (idx: number) => void
  selectedPrompts: Set<string>
  onTogglePrompt: (prompt: string) => void
  // Controls
  activeTab?: 'relations' | 'prompts'
  onTabChange?: (tab: 'relations' | 'prompts') => void
  // UI Customization
  renderSidebar?: (tabs: React.ReactNode) => React.ReactNode
}

export function ContextReviewPanel({
  result,
  selectedRelations,
  onToggleRelation,
  selectedPrompts,
  onTogglePrompt,
  activeTab: externalTab,
  onTabChange,
  renderSidebar,
}: ContextReviewPanelProps) {
  const { t } = useTranslation(['chat', 'common'])
  const [internalTab, setInternalTab] = useState<'relations' | 'prompts'>('relations')
  
  const activeTab = externalTab || internalTab
  const setActiveTab = onTabChange || setInternalTab

  const tabs = (
    <>
      <button 
        onClick={() => setActiveTab('relations')} 
        className={cn(
          'mx-3 px-5 py-4 rounded-2xl text-xs font-bold uppercase tracking-widest flex items-center justify-between transition-all outline-none', 
          activeTab === 'relations' ? 'bg-white shadow-lg shadow-zinc-200/50 text-indigo-600 scale-105' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100/50'
        )}
      >
        <div className="flex items-center gap-2"><LinkIcon className="w-4 h-4" />{t('chat:tab_relations')}</div>
        <Badge variant="secondary" className={cn("ml-2 border-none px-1.5 h-5 font-bold tabular-nums", activeTab === 'relations' ? "bg-indigo-500 text-white" : "bg-zinc-200 text-zinc-500")}>
          {selectedRelations.size}/{result.relationships.length}
        </Badge>
      </button>
      <button 
        onClick={() => setActiveTab('prompts')} 
        className={cn(
          'mx-3 px-5 py-4 rounded-2xl text-xs font-bold uppercase tracking-widest flex items-center justify-between transition-all outline-none', 
          activeTab === 'prompts' ? 'bg-white shadow-lg shadow-zinc-200/50 text-indigo-600 scale-105' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100/50'
        )}
      >
        <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4" />建议</div>
        <Badge variant="secondary" className={cn("ml-2 border-none px-1.5 h-5 font-bold tabular-nums", activeTab === 'prompts' ? "bg-indigo-500 text-white" : "bg-zinc-200 text-zinc-500")}>
          {selectedPrompts.size}/{result.suggestedPrompts.length}
        </Badge>
      </button>
    </>
  )

  return (
    <div className="flex h-full">
      {renderSidebar && <div className="w-[200px] flex-shrink-0 border-r border-zinc-100 flex flex-col py-4 gap-1 bg-zinc-50/20">{renderSidebar(tabs)}</div>}
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#fcfcfc]">
        {activeTab === 'relations' ? (
          <div className="grid gap-2">
            {result.relationships.map((rel, i) => (
              <div 
                key={i} 
                className={cn(
                  "group flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer bg-white shadow-sm hover:shadow-md w-full overflow-hidden", 
                  selectedRelations.has(i) ? "border-indigo-200 ring-1 ring-indigo-50" : "border-zinc-100 hover:border-zinc-200"
                )} 
                onClick={() => onToggleRelation(i)}
              >
                <div className={cn("w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 mt-0.5", selectedRelations.has(i) ? "bg-indigo-500 border-indigo-500" : "border-zinc-200")}>
                   {selectedRelations.has(i) && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                      <span className="text-xs font-bold text-zinc-400 truncate max-w-[140px]" title={rel.sourceTable}>{rel.sourceTable}</span>
                      <Badge variant="secondary" className="bg-zinc-100 text-zinc-600 font-mono text-[10px] px-1.5 h-5 border-none shrink-0">{rel.sourceColumn}</Badge>
                      <ArrowRight className="w-3 h-3 text-zinc-300 shrink-0" />
                      <span className="text-xs font-bold text-zinc-400 truncate max-w-[140px]" title={rel.targetTable}>{rel.targetTable}</span>
                      <Badge variant="secondary" className="bg-zinc-100 text-zinc-600 font-mono text-[10px] px-1.5 h-5 border-none shrink-0">{rel.targetColumn}</Badge>
                    </div>
                    {rel.confidence !== undefined && (
                      <span className={cn('text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 w-fit', rel.confidence > 0.8 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100')}>
                        {Math.round(rel.confidence * 100)}% MATCH
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-400 font-medium truncate italic leading-tight" title={rel.reason}>&ldquo;{rel.reason}&rdquo;</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-2">
            {result.suggestedPrompts.map((p, i) => (
              <div 
                key={i} 
                className={cn(
                  "group flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer bg-white shadow-sm hover:shadow-md", 
                  selectedPrompts.has(p) ? "border-indigo-200 ring-1 ring-indigo-50" : "border-zinc-100 hover:border-zinc-200"
                )} 
                onClick={() => onTogglePrompt(p)}
              >
                <div className={cn("w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0", selectedPrompts.has(p) ? "bg-indigo-500 border-indigo-500" : "border-zinc-200")}>
                  {selectedPrompts.has(p) && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-sm font-bold text-zinc-700 truncate">{p}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
