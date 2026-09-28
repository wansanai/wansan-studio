import React from 'react'
import {
  Sparkles,
  RefreshCw,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useProjectStore } from '../../stores/useProjectStore'
import { useTranslation } from 'react-i18next'
import { useAutoLink } from '../../hooks/useAutoLink'

interface EmptyStateProps {
  onSelectPrompt: (text: string) => void
  isChatLoading: boolean
  isRestoring: boolean
}

export function EmptyState({
  onSelectPrompt,
  isChatLoading,
  isRestoring,
}: EmptyStateProps) {
  const suggestedPrompts = useProjectStore(state => state.suggestedPrompts)
  const files = useProjectStore(state => state.files)
  const { t } = useTranslation(['chat', 'common'])
  const { checkAutoLink, isAnalyzing } = useAutoLink()

  const hasData = files.length > 0
  const hasSuggestions = suggestedPrompts && suggestedPrompts.length > 0

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto px-6">
      {/* 1. Dynamic Content Section */}
      <div className="w-full max-w-lg flex flex-col items-center gap-12">
        {!hasSuggestions ? (
          /* State: Modeling Needed or No Data */
          <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out">
            <div className="text-center mb-12 space-y-3">
              <h2 className="text-3xl font-black text-zinc-900 tracking-tight dark:text-white">
                {t('chat:empty_title')}
              </h2>
              <p className="text-zinc-400 text-sm font-medium max-w-sm mx-auto leading-relaxed">
                {hasData ? t('chat:empty_subtitle_need_analysis') : t('chat:empty_subtitle')}
              </p>
            </div>

            {hasData ? (
              /* The "Magic Card" for Analysis */
              <button
                onClick={() => checkAutoLink()}
                disabled={isChatLoading || isRestoring || isAnalyzing}
                className={cn(
                  'group relative w-full p-12 rounded-[3.5rem] bg-white dark:bg-zinc-900 flex flex-col items-center gap-8 transition-all duration-500 active:scale-[0.97]',
                  'shadow-[0_20px_50px_rgba(79,70,229,0.1)] hover:shadow-[0_30px_70px_rgba(79,70,229,0.2)] dark:shadow-none border border-zinc-100/50 dark:border-zinc-800',
                  isAnalyzing ? 'opacity-90' : ''
                )}
              >
                {/* Subtle Background Glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-transparent rounded-[3.5rem] -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                
                <div className={cn(
                  "w-20 h-20 rounded-[2.5rem] bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-300 dark:shadow-none transition-all duration-700 ease-out",
                  isAnalyzing ? "animate-spin scale-90" : "group-hover:rotate-12 group-hover:scale-110"
                )}>
                  {isAnalyzing ? (
                    <RefreshCw className="w-8 h-8 text-white" />
                  ) : (
                    <Sparkles className="w-8 h-8 text-white fill-current animate-pulse" />
                  )}
                </div>

                <div className="text-center space-y-2">
                  <div className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-[0.2em]">
                    {isAnalyzing ? t('chat:auto_link_analyzing_title') : t('chat:run_analysis')}
                  </div>
                  <p className="text-xs text-zinc-400 font-bold italic tracking-wide opacity-80 group-hover:text-indigo-500/70 transition-colors">
                    {t('chat:analysis_cta_desc')}
                  </p>
                </div>

                {/* Decorative Dots */}
                <div className="absolute top-8 right-8 flex gap-1">
                   <div className="w-1.5 h-1.5 rounded-full bg-indigo-100 dark:bg-zinc-800" />
                   <div className="w-1.5 h-1.5 rounded-full bg-indigo-50 dark:bg-zinc-800" />
                </div>
              </button>
            ) : (
              /* No Data Placeholder */
              <div className="w-full p-12 rounded-[3.5rem] border-2 border-dashed border-zinc-100 dark:border-zinc-800 flex flex-col items-center gap-4 opacity-40">
                 <div className="w-12 h-12 rounded-2xl bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-zinc-300" />
                 </div>
                 <div className="text-xs font-black text-zinc-400 uppercase tracking-[0.3em]">
                   {t('chat:no_data_yet')}
                 </div>
              </div>
            )}
          </div>
        ) : (
          /* State: AI Suggestions List */
          <div className="w-full flex flex-col items-center">
            <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-1000">
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight mb-4 flex items-center justify-center gap-3">
                <Sparkles className="w-5 h-5 text-indigo-500 opacity-40" />
                {t('chat:empty_title')}
              </h2>
              
              <div className="flex items-center justify-center gap-4">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-zinc-100 dark:to-zinc-800" />
                <p className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.4em] opacity-70 whitespace-nowrap">
                  {t('chat:empty_subtitle_with_ai')}
                </p>
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-zinc-100 dark:to-zinc-800" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 w-full">
              {suggestedPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (!isChatLoading && !isRestoring && !isAnalyzing) {
                      onSelectPrompt(prompt)
                    }
                  }}
                  disabled={isChatLoading || isRestoring || isAnalyzing}
                  style={{ animationDelay: `${idx * 100}ms` }}
                  className={cn(
                    'group flex items-center gap-4 px-6 py-4 rounded-[1.5rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-bold shadow-sm transition-all animate-in fade-in slide-in-from-left-4 duration-700 fill-mode-both',
                    isChatLoading || isRestoring || isAnalyzing
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:border-indigo-300 dark:hover:border-indigo-800 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/10 hover:shadow-xl hover:shadow-indigo-100/50 hover:-translate-y-0.5 active:scale-[0.98]'
                  )}
                >
                  <div className="w-2 h-2 rounded-full bg-indigo-100 dark:bg-zinc-800 group-hover:bg-indigo-400 transition-colors shrink-0" />
                  <span className="truncate flex-1 text-left tracking-wide">{prompt}</span>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
                       <div className="w-1.5 h-1.5 border-t-2 border-r-2 border-white rotate-45 ml-[-1px]" />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Subtle Re-trigger for Suggestions */}
            <div className="mt-10 animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-500 fill-mode-both">
              <button
                onClick={() => checkAutoLink()}
                disabled={isChatLoading || isRestoring || isAnalyzing}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all',
                  isAnalyzing
                    ? 'text-indigo-400'
                    : 'text-zinc-300 hover:text-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 active:scale-95'
                )}
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    {t('chat:auto_link_analyzing_title')}...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 opacity-50" />
                    {t('chat:run_analysis')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
