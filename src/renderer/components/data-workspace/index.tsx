import React, { useState } from 'react'
import { useProjectStore } from '@/stores/useProjectStore'
import { DataPreviewPanel } from '../report/data-preview-panel'
import { useTranslation } from 'react-i18next'
import {
  Database,
  Hash,
  Info,
  Plus,
  GitMerge,
  RefreshCw,
  Trash2,
  FileSpreadsheet,
  Table as TableIcon,
  Settings2,
} from 'lucide-react'
import { ExpandableAction } from '../ui/expandable-action'
import { ConfirmDialog } from '../modals/ConfirmDialog'
import { useToastStore } from '@/stores/useToastStore'
import { DataLineageDialog } from '../modals/DataLineageDialog'
import { useWizardStore } from '@/stores/useWizardStore'
import { useProGate } from '@/hooks/use-pro-gate'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import { ColumnsView } from './columns-view'
import { RelationsView } from './relations-view'

export function DataWorkspace() {
  const { t } = useTranslation('common')
  const toast = useToastStore()
  const openWizard = useWizardStore(s => s.open)
  const { checkGate, gateNode } = useProGate()

  const activeFileId = useProjectStore(s => s.activeFileId)
  const files = useProjectStore(s => s.files)
  const removeFile = useProjectStore(s => s.removeFile)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLineage, setShowLineage] = useState(false)
  const [activeTab, setActiveTab] = useState<
    'data' | 'fields' | 'relations'
  >('data')
  const [pendingExtractCol, setPendingExtractCol] = useState<any>(null)

  const currentFile = files.find(f => f.id === activeFileId) || files[0]

  if (!currentFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-400 bg-white dark:bg-zinc-950">
        <Database className="w-12 h-12 mb-4 text-zinc-200 dark:text-zinc-800" />
        <p>{t('select_table')}</p>
      </div>
    )
  }

  const handleAppend = () => {
    checkGate(t('append_data', 'Append'), () => {
      openWizard('append', currentFile.id)
    })
  }
  const handleMerge = () => {
    checkGate(t('merge_data', 'Merge'), () => {
      openWizard('merge', currentFile.id)
    })
  }
  const handleReplace = () => {
    openWizard('replace', currentFile.id)
  }
  const handleDeleteFile = async () => {
    await removeFile(currentFile.id)
    setShowDeleteConfirm(false)
    toast.addToast({ title: t('file_deleted'), type: 'success' })
  }

  const handleRunAIExtractFromGrid = (columnName: string) => {
    const col = currentFile.columns.find(c => c.name === columnName)
    if (col) {
      setActiveTab('fields')
      setPendingExtractCol(col)
      // Reset after a short delay so the prop change is detected
      setTimeout(() => setPendingExtractCol(null), 100)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fbfbfa] dark:bg-zinc-950 overflow-hidden relative">
      {/* 1. Global Workspace Header */}
      <header className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-[#fbfbfa] dark:bg-zinc-900 z-30">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="p-2 bg-indigo-100/50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200/50 dark:border-indigo-800 shrink-0 text-indigo-600 dark:text-indigo-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="text-base font-bold tracking-tight truncate leading-tight">
              {currentFile.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setShowLineage(true)}
                className="flex items-center gap-1 px-1.5 py-0.5 bg-zinc-100/80 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded border border-zinc-200/50 dark:border-zinc-700 whitespace-nowrap hover:bg-zinc-200/80 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all cursor-help group"
              >
                <Database className="w-2 h-2 opacity-70 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                <code className="text-[9px] font-mono">
                  {currentFile.tableName}
                </code>
                <Info className="w-2 h-2 opacity-0 group-hover:opacity-100 ml-0.5" />
              </button>
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded border border-emerald-200/50 dark:border-emerald-800 whitespace-nowrap">
                <Hash className="w-2 h-2" />
                <span className="text-[9px] font-black uppercase tracking-tight">
                  {currentFile.rowCount?.toLocaleString() || 0} {t('rows')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Workspace Toolbar */}
        <div className="flex items-center p-1 bg-zinc-200/40 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 rounded-xl shadow-sm shrink-0">
          <div className="flex items-center gap-0.5">
            <ExpandableAction
              icon={<Plus className="w-3.5 h-3.5" />}
              label={t('append_data')}
              onClick={handleAppend}
              className="text-emerald-600 dark:text-emerald-400 hover:bg-white dark:hover:bg-zinc-700 border-transparent h-8"
            />
            <ExpandableAction
              icon={<GitMerge className="w-3.5 h-3.5" />}
              label={t('merge_data')}
              onClick={handleMerge}
              className="text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-zinc-700 border-transparent h-8"
            />
            <ExpandableAction
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              label={t('replace_source')}
              onClick={handleReplace}
              className="text-amber-600 dark:text-amber-400 hover:bg-white dark:hover:bg-zinc-700 border-transparent h-8"
            />
          </div>
          <div className="w-px h-3 bg-zinc-300 dark:bg-zinc-700 mx-1" />
          <ExpandableAction
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label={t('delete')}
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-600 dark:text-red-400 hover:bg-white dark:hover:bg-zinc-700 border-transparent h-8"
          />
        </div>
      </header>

      {/* 2. Main Viewport with Read/Write Tabs */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#fbfbfa] dark:bg-zinc-900">
        <Tabs
          value={activeTab}
          onValueChange={(v: any) => setActiveTab(v)}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-6 border-b border-zinc-100 dark:border-zinc-800 bg-[#fbfbfa] dark:bg-zinc-900/50 backdrop-blur shrink-0">
            <TabsList className="h-10 bg-transparent gap-8 p-0">
              <TabsTrigger
                value="data"
                className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 text-xs font-bold gap-2 text-zinc-400 data-[state=active]:text-indigo-600 transition-all"
              >
                <TableIcon className="w-3.5 h-3.5" />
                {t('data_viewer', 'Data')}
              </TabsTrigger>
              <TabsTrigger
                value="fields"
                className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 text-xs font-bold gap-2 text-zinc-400 data-[state=active]:text-indigo-600 transition-all"
              >
                <Settings2 className="w-3.5 h-3.5" />
                {t('columns')}
              </TabsTrigger>
              <TabsTrigger
                value="relations"
                className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 text-xs font-bold gap-2 text-zinc-400 data-[state=active]:text-indigo-600 transition-all"
              >
                <GitMerge className="w-3.5 h-3.5" />
                {t('relations')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="data"
            className="flex-1 min-h-0 m-0 focus-visible:outline-none overflow-hidden bg-transparent dark:bg-zinc-900"
          >
            <DataPreviewPanel
              onModifyStructure={() => setActiveTab('fields')}
              onRunAIExtract={handleRunAIExtractFromGrid}
            />
          </TabsContent>

          <TabsContent
            value="fields"
            className="flex-1 min-h-0 m-0 focus-visible:outline-none overflow-hidden flex flex-col bg-zinc-50 dark:bg-zinc-950/30 relative"
          >
            <div className="absolute inset-0 m-0 p-4 overflow-auto custom-scrollbar">
              <ColumnsView
                file={currentFile}
                initialExtractColumn={pendingExtractCol}
              />
            </div>
          </TabsContent>
          <TabsContent
            value="relations"
            className="flex-1 min-h-0 m-0 focus-visible:outline-none overflow-hidden flex flex-col bg-zinc-50 dark:bg-zinc-950/30 relative"
          >
            <div className="absolute inset-0 m-0 p-4 overflow-auto custom-scrollbar">
              <RelationsView file={currentFile} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={handleDeleteFile}
        title={t('delete_file_confirm_title')}
        description={t('delete_file_confirm_desc')}
        variant="destructive"
      />
      <DataLineageDialog
        open={showLineage}
        onOpenChange={setShowLineage}
        file={currentFile}
      />
      {gateNode}
    </div>
  )
}
