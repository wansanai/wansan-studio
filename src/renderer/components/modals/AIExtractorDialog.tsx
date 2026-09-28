import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Sparkles, ArrowRight, Loader2, Play, MoreHorizontal, Save, Trash2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getVisibleColumns } from '@shared/utils/schema-utils'
import { ColumnSchema } from '@shared/types'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { SYSTEM_PRESETS_EN, SYSTEM_PRESETS_ZH } from '@/lib/ai-presets'

interface AIExtractorDialogProps {
  isOpen: boolean
  onClose: () => void
  onRun: (prompt: string, newColumnName: string, sourceColumn: string) => void
  column: ColumnSchema | null
  columns: ColumnSchema[] // [NEW] Added for selection
  tableName: string
  initialPrompt?: string
  initialColumnName?: string
}

export function AIExtractorDialog({
  isOpen,
  onClose,
  onRun,
  column: initialCol,
  columns,
  tableName,
  initialPrompt,
  initialColumnName
}: AIExtractorDialogProps) {
  const { t } = useTranslation('common')
  const { 
    extractTemplates, 
    addExtractTemplate, 
    removeExtractTemplate, 
    importExtractTemplates,
    useExtractTemplate: markTemplateUsed 
  } = useSettingsStore()
  
  const [selectedColName, setSelectedColName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [newColumnName, setNewColumnName] = useState('')
  const [isPreviewing, setIsPreviewing] = useState(false)
  
  // Name conflict validation
  const conflictCol = useMemo(() => {
    return columns.find(c => c.name.toLowerCase() === newColumnName.toLowerCase())
  }, [columns, newColumnName])

  const isRawConflict = conflictCol && conflictCol.sourceType !== 'ai'
  const isAIOverwrite = conflictCol && conflictCol.sourceType === 'ai'

  const [previewData, setPreviewData] = useState<unknown[]>([])
  const [previewResult, setPreviewResult] = useState<string[]>([])
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)
  
  // Current active column (either passed in or selected via UI)
  const activeCol = useMemo(() => {
    return columns.find(c => c.name === selectedColName) || initialCol
  }, [columns, selectedColName, initialCol])

  // Save template state
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')

  // Sort templates: recently used first, fallback to recently created
  const sortedTemplates = useMemo(() => {
    return [...extractTemplates].sort((a, b) => {
      const timeA = a.lastUsedAt ?? a.createdAt ?? 0
      const timeB = b.lastUsedAt ?? b.createdAt ?? 0
      return timeB - timeA
    })
  }, [extractTemplates])

  // Sync state when props or selection changes
  useEffect(() => {
    if (isOpen) {
      if (initialCol) {
        setSelectedColName(initialCol.name)
      } else if (columns.length > 0 && !selectedColName) {
        // Find first text column as default
        const textCol = columns.find(c => c.type === 'VARCHAR') || columns[0]
        setSelectedColName(textCol.name)
      }
    }
  }, [isOpen, initialCol, columns, selectedColName])

  // Load sample data when active column changes
  useEffect(() => {
    if (isOpen && activeCol) {
      setPreviewData(activeCol.sampleValues?.slice(0, 5) || [])
      setNewColumnName(initialColumnName || `${activeCol.name}_ai`)
      setPrompt(initialPrompt || '')
      setPreviewResult([])
      setEstimatedCost(null)
      setIsSavingTemplate(false)
      setNewTemplateName('')
    }
  }, [isOpen, activeCol, initialPrompt, initialColumnName])

  const handlePreview = async () => {
    if (!prompt.trim() || !activeCol) return
    setIsPreviewing(true)
    try {
      const res = await window.electronAPI.aiPreviewExtract({
        tableName, 
        columnName: activeCol.name, 
        sampleData: previewData, 
        prompt
      })
      
      if (res.success && res.data) {
        setPreviewResult(res.data.results)
        setEstimatedCost(res.data.estimatedCost)
      } else {
        console.error(res.error)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleRun = () => {
    if (!prompt.trim() || !newColumnName.trim() || !activeCol) return
    onRun(prompt, newColumnName, activeCol.name)
    onClose()
  }

  const applyPreset = (templateId: string, p: string) => {
    setPrompt(p)
    markTemplateUsed(templateId)
  }

  const handleSaveTemplate = () => {
    if (!prompt.trim() || !newTemplateName.trim()) return
    addExtractTemplate({ label: newTemplateName, prompt })
    setIsSavingTemplate(false)
    setNewTemplateName('')
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-5xl rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden bg-[#fbfbfa] text-zinc-900 flex flex-col h-[700px]">
        {/* Header */}
        <div className="px-8 py-6 border-b border-zinc-100 bg-[#fbfbfa] flex justify-between items-start shrink-0">
          <div>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3 text-zinc-900 tracking-tight">
              <div className="p-2.5 bg-zinc-900 text-white rounded-xl shadow-lg shadow-zinc-200">
                <Sparkles className="w-5 h-5 fill-current" />
              </div>
              {t('ai_extract_title', 'AI Smart Extraction')}
            </DialogTitle>
            <p className="text-sm text-zinc-500 mt-2 pl-[3.25rem] font-medium leading-relaxed max-w-lg">
              {t('ai_extract_desc', 'Transform your data using AI. Extract information, analyze sentiment, or clean formats.')}
            </p>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 bg-zinc-100/30">
          {/* Left: Configuration - Input Zone */}
          <div className="w-7/12 flex flex-col bg-white border-r border-zinc-100 shadow-[20px_0_40px_-10px_rgba(0,0,0,0.02)] z-10">
            
            {/* Top Bar: Extraction Flow (Source -> Target) */}
            <div className="px-6 py-6 border-b border-zinc-50 bg-white shrink-0">
               <div className="flex flex-col gap-2">
                  {/* Labels Row */}
                  <div className="flex items-center gap-3 px-1">
                    <Label className="flex-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      {t('source_column', 'Source Column')}
                    </Label>
                    <div className="w-8 shrink-0" /> {/* Spacer for arrow */}
                    <Label className="flex-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      {t('target_column_name')}
                    </Label>
                  </div>

                  {/* Inputs Row */}
                  <div className="flex items-center gap-3">
                    {/* Source Column Selector */}
                    <div className="flex-1 min-w-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="h-10 w-full rounded-xl border-zinc-100 bg-zinc-50/50 hover:bg-white text-zinc-900 font-bold justify-between px-4 transition-all shadow-none group">
                            <span className="truncate">{selectedColName || 'Select'}</span>
                            <MoreHorizontal className="w-3.5 h-3.5 opacity-30 group-hover:opacity-60" />
                          </Button>
                        </DropdownMenuTrigger>
                                              <DropdownMenuContent align="start" className="w-56 rounded-2xl p-2 shadow-2xl border-none">
                                                <div className="px-2 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('available_columns', 'Columns')}</div>
                                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                    {getVisibleColumns(columns).map(c => (
                                                      <DropdownMenuItem 
                                                        key={c.name} 
                                                        onClick={() => setSelectedColName(c.name)}
                                                        className={cn("rounded-xl py-2 px-3 gap-2", selectedColName === c.name && "bg-purple-50 text-purple-600 font-bold")}
                                                      >                                  <div className={cn("w-2 h-2 rounded-full", selectedColName === c.name ? "bg-purple-500" : "bg-zinc-200")} />
                                  {c.name}
                                </DropdownMenuItem>
                              ))}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Visual Arrow */}
                    <div className="shrink-0">
                      <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-300">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Target Column Input */}
                    <div className="flex-1 min-w-0">
                                          <div className="relative">
                                            <Input 
                                              value={newColumnName}
                                              onChange={e => setNewColumnName(e.target.value)}
                                              className={cn(
                                                "h-10 rounded-xl border-zinc-100 bg-zinc-50/50 focus:bg-white focus:ring-2 focus:ring-purple-500/20 font-bold text-sm shadow-none transition-all hover:border-purple-200 w-full",
                                                isRawConflict && "border-red-500 focus:ring-red-500/20 hover:border-red-500",
                                                isAIOverwrite && "border-amber-500 focus:ring-amber-500/20 hover:border-amber-500"
                                              )}
                                              placeholder="e.g. sentiment"
                                            />
                                            {isRawConflict && (
                                              <div className="absolute -bottom-5 left-1">
                                                <span className="text-[9px] text-red-500 font-bold animate-in fade-in slide-in-from-top-1">
                                                  {t('name_taken', 'Name already taken')}
                                                </span>
                                              </div>
                                            )}
                                            {isAIOverwrite && (
                                              <div className="absolute -bottom-5 left-1">
                                                <span className="text-[9px] text-amber-600 font-bold animate-in fade-in slide-in-from-top-1">
                                                  {t('overwrite_warning', 'Will overwrite existing AI field')}
                                                </span>
                                              </div>
                                            )}
                                          </div>                    </div>
                  </div>
               </div>
            </div>

            {/* Middle: Textarea (Flex-1) */}
            <div className="flex-1 p-6 pb-2 min-h-0 flex flex-col">
              <div className="flex justify-between items-center mb-2 px-1">
                 <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  {t('prompt')}
                </Label>

                {/* Save Template Action - Integrated here */}
                <div className="shrink-0">
                  {isSavingTemplate ? (
                    <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-200 bg-purple-50 p-1 rounded-lg border border-purple-100">
                      <Input 
                        className="h-6 w-32 text-[10px] rounded-md border-none bg-transparent focus:ring-0" 
                        placeholder={t('template_name_placeholder')}
                        value={newTemplateName}
                        onChange={e => setNewTemplateName(e.target.value)}
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()}
                      />
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-md hover:bg-white hover:text-green-600" onClick={handleSaveTemplate}>
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-md hover:bg-white hover:text-red-600" onClick={() => setIsSavingTemplate(false)}>
                        <span className="text-[10px] font-bold">✕</span>
                      </Button>
                    </div>
                  ) : (
                    <button 
                      className="text-[10px] font-bold text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-100/50 transition-all flex items-center gap-1.5 shadow-sm"
                      onClick={() => {
                        if (prompt.trim()) setIsSavingTemplate(true)
                      }}
                      disabled={!prompt.trim()}
                    >
                      <Save className="w-3 h-3" />
                      {t('save_template')}
                    </button>
                  )}
                </div>
              </div>
              <Textarea 
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={t('prompt_placeholder', 'e.g. Extract the email address from this text...')}
                className="w-full flex-1 rounded-2xl border-zinc-200 bg-zinc-50/30 resize-none p-5 font-medium text-base focus:bg-white focus:ring-2 focus:ring-purple-500/20 leading-relaxed shadow-sm transition-all hover:border-zinc-300"
              />
            </div>

            {/* Bottom: Templates Toolbar */}
            <div className="px-6 py-2 shrink-0">
              <div className="flex flex-wrap gap-2 items-center min-h-[2rem]">
                {extractTemplates.length === 0 ? (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => importExtractTemplates(SYSTEM_PRESETS_ZH)}
                      className="text-[10px] font-medium px-3 py-1 bg-zinc-50 text-zinc-500 hover:text-purple-600 hover:border-purple-200 rounded-full border border-dashed border-zinc-200 transition-all flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      {t('import_presets_zh')}
                    </button>
                    <button 
                      onClick={() => importExtractTemplates(SYSTEM_PRESETS_EN)}
                      className="text-[10px] font-medium px-3 py-1 bg-zinc-50 text-zinc-500 hover:text-purple-600 hover:border-purple-200 rounded-full border border-dashed border-zinc-200 transition-all flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      {t('import_presets_en')}
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider mr-1">Templates:</span>
                    <div className="flex-1 flex flex-wrap gap-2 max-h-[4.5rem] overflow-y-auto custom-scrollbar">
                      {sortedTemplates.map((tpl) => (
                        <div key={tpl.id} className="group/tag relative">
                          <button
                            onClick={() => applyPreset(tpl.id, tpl.prompt)}
                            className="text-[11px] font-medium px-3 py-1 bg-zinc-50 hover:bg-purple-50 text-zinc-600 hover:text-purple-700 rounded-full border border-zinc-200 hover:border-purple-200 transition-all pr-6 truncate max-w-[10rem]"
                          >
                            {tpl.label}
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              removeExtractTemplate(tpl.id)
                            }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-red-500 opacity-0 group-hover/tag:opacity-100 transition-all p-0.5 rounded-full hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-[10px] w-6 h-6 flex items-center justify-center bg-zinc-50 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 rounded-full border border-zinc-200 transition-colors">
                            <MoreHorizontal className="w-3 h-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                          <DropdownMenuItem onClick={() => importExtractTemplates(SYSTEM_PRESETS_ZH)}>
                            {t('import_presets_zh')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => importExtractTemplates(SYSTEM_PRESETS_EN)}>
                            {t('import_presets_en')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600 focus:text-red-700 focus:bg-red-50" onClick={() => extractTemplates.forEach(t => removeExtractTemplate(t.id))}>
                            {t('clear_templates')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer Action */}
            <div className="p-6 pt-2 shrink-0">
              <Button 
                onClick={handlePreview} 
                disabled={isPreviewing || !prompt}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl h-11 font-bold text-sm tracking-wide shadow-lg shadow-zinc-200/50 hover:shadow-xl hover:shadow-zinc-300/50 transition-all"
              >
                {isPreviewing ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Play className="w-4 h-4 mr-2 fill-current"/>}
                {t('generate_preview')}
              </Button>
            </div>

          </div>

          {/* Right: Preview - Output Zone */}
          <div className="w-5/12 bg-zinc-100/30 flex flex-col relative">
            {/* Dot Pattern Background */}
            <div className="absolute inset-0 opacity-[0.015] pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            </div>

            <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-[#fbfbfa]/80 backdrop-blur-sm z-10 sticky top-0">
               <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                 {t('preview_results')}
               </span>
               {typeof estimatedCost === 'number' && (
                 <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100 font-bold tabular-nums">
                   ${estimatedCost.toFixed(4)}
                 </Badge>
               )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 z-0 custom-scrollbar">
              {previewData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-zinc-300" />
                  </div>
                  <p className="text-xs font-medium">{t('no_sample_data')}</p>
                </div>
              ) : (
                previewData.map((val, idx) => (
                  <div key={idx} className="group bg-white border border-zinc-100 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-purple-100 transition-all duration-300">
                    <div className="flex items-start gap-3">
                      {/* Input (Left Small) */}
                      <div className="w-1/3 shrink-0 flex flex-col gap-1">
                        <div className="text-[8px] text-zinc-400 uppercase font-bold tracking-tighter">{t('input')}</div>
                        <div className="text-xs text-zinc-500 leading-snug break-words line-clamp-3 font-medium">{String(val)}</div>
                      </div>

                      {/* Arrow */}
                      <div className="mt-4 shrink-0 text-zinc-300">
                        <ArrowRight className="w-3 h-3" />
                      </div>

                      {/* Output (Right Larger) */}
                      <div className="flex-1 min-w-0 bg-purple-50/30 rounded-lg p-2.5 border border-purple-100/50 group-hover:bg-purple-50/60 transition-colors">
                        <div className="text-[8px] text-purple-400 uppercase font-bold tracking-tighter mb-1 flex justify-between items-center">
                          {t('output_ai')}
                          <Sparkles className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {previewResult[idx] ? (
                          <div className="text-[13px] text-purple-900 font-semibold leading-relaxed break-words">{previewResult[idx]}</div>
                        ) : (
                          <div className="flex gap-1 items-center h-4">
                             <div className="w-1 h-1 bg-purple-200 rounded-full animate-bounce [animation-delay:-0.3s]" />
                             <div className="w-1 h-1 bg-purple-200 rounded-full animate-bounce [animation-delay:-0.15s]" />
                             <div className="w-1 h-1 bg-purple-200 rounded-full animate-bounce" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-8 py-5 border-t border-zinc-100 bg-[#fbfbfa] shrink-0">
          <div className="flex-1 text-xs text-zinc-400 flex items-center gap-2 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>{t('ai_extract_warning')}</span>
          </div>
          <Button
            variant="ghost"
            onClick={onClose}
            className="rounded-xl font-bold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleRun}
            disabled={!newColumnName || !prompt || isRawConflict}
            className={cn(
              "bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-8 font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all hover:-translate-y-0.5",
              isAIOverwrite && "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20 hover:shadow-amber-500/40"
            )}
          >
            {isAIOverwrite ? t('overwrite_extraction', 'Overwrite & Run') : t('apply_extraction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}