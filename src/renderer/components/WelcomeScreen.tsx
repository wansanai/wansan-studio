import React, { useState } from 'react'
import { useProjectStore } from '../stores/useProjectStore'
import { useWizardStore } from '../stores/useWizardStore' // Import Wizard Store
import { loadDemoData } from '../lib/demo-data'
import { useToastStore } from '../stores/useToastStore'
import { Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { useTranslation } from 'react-i18next'
import { useProGate } from '@/hooks/use-pro-gate'

interface WelcomeScreenProps {
  onDataImported?: (tableName: string) => void
}

export function WelcomeScreen({
  onDataImported: _onDataImported,
}: WelcomeScreenProps) {
  const { addToast } = useToastStore()
  const { t } = useTranslation('chat')
  const { isActivated, checkGate, gateNode } = useProGate()
  const [isDragging, setIsDragging] = useState(false)
  const [isLoadingDemo, setIsLoadingDemo] = useState(false)

  // Wizard Integration
  const openWizard = useWizardStore(s => s.open)

  const allowedExtensions = ['.xlsx', '.xls', '.csv', '.json']

  const TRIAL_FILE_LIMIT = 3

  const handleFileSelect = async () => {
    const currentFiles = useProjectStore.getState().files
    if (!isActivated && currentFiles.length >= TRIAL_FILE_LIMIT) {
      checkGate(t('import_data', { ns: 'common' }), () => {})
      return
    }

    try {
      const result = await window.electronAPI.selectFiles()
      if (result.success && result.data && result.data.length > 0) {
        const filesToProcess = result.data.map(f => ({
          path: f.path,
          name: f.path.split(/[\\/]/).pop() || 'unknown',
          size: f.size,
        }))

        // Open Wizard with selected files
        openWizard('import', undefined, filesToProcess)
      }
    } catch (error) {
      console.error('File selection error:', error)
      alert(
        `File selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const currentFiles = useProjectStore.getState().files
    if (!isActivated && currentFiles.length >= TRIAL_FILE_LIMIT) {
      checkGate(t('import_data', { ns: 'common' }), () => {})
      return
    }

    const droppedFiles = Array.from(e.dataTransfer.files)
    console.log('handleDrop', droppedFiles)

    // Filter supported types
    const validFiles = droppedFiles.filter(file => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      return allowedExtensions.includes(ext)
    })

    if (validFiles.length === 0) {
      if (validFiles.length > 0) alert(t('unsupported_file_type'))
      return
    }

    // Pass to Wizard
    const mappedFiles = validFiles.map(f => ({
      path: window.electronAPI.getPathForFile(f),
      name: f.name,
      size: f.size,
    }))

    openWizard('import', undefined, mappedFiles)
  }

  const handleLoadDemoData = async () => {
    setIsLoadingDemo(true)
    try {
      // Demo data load...
      const demoPrompts = t('demo_prompts', { returnObjects: true }) as string[]
      const result = await loadDemoData(demoPrompts)
      if (result.success) {
        addToast({
          title: t('demo_success_title'),
          description: t('demo_success_msg'),
          type: 'success',
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Load demo data error:', error)
      addToast({
        title: t('demo_error_title'),
        description:
          error instanceof Error
            ? error.message
            : t('unknown_error', 'Unknown error'),
        type: 'error',
      })
    } finally {
      setIsLoadingDemo(false)
    }
  }

  return (
    <div className="flex-1 flex items-start justify-center p-8 pt-[15vh]">
      {gateNode}
      {/* Drop Zone - 核心空态界面 */}
      <div
        className={`wansan-drop-zone w-full max-w-2xl text-center animate-card-enter ${
          isDragging ? 'active' : ''
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleFileSelect}
      >
        <>
          {/* Icon */}
          <div className="w-20 h-20 mx-auto mb-6 bg-zinc-100 rounded-2xl flex items-center justify-center">
            <svg
              className={`w-10 h-10 transition-colors ${isDragging ? 'text-indigo-600' : 'text-zinc-400'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>

          {/* 主文案 */}
          <h2 className="text-xl font-semibold text-zinc-900 mb-2">
            {t('file_drag_title')}
          </h2>
          <p className="text-zinc-500 mb-4">{t('file_drag_subtitle')}</p>

          {/* 支持的格式 */}
          <div className="flex items-center justify-center gap-3 text-xs text-zinc-400">
            <span className="px-2 py-1 bg-zinc-100 rounded">.xlsx</span>
            <span className="px-2 py-1 bg-zinc-100 rounded">.xls</span>
            <span className="px-2 py-1 bg-zinc-100 rounded">.csv</span>
          </div>

          {/* Load Demo Data Section */}
          <div className="mt-8 pt-6 border-t border-zinc-100">
            <div className="flex flex-col items-center gap-3 w-full max-w-xs mx-auto">
              <div className="flex items-center gap-2 w-full">
                <Separator className="flex-1" />
                <span className="text-xs text-zinc-400 uppercase tracking-wide">
                  {t('demo_or_start_with', 'or start with')}
                </span>
                <Separator className="flex-1" />
              </div>

              <Button
                variant="outline"
                className="w-full gap-2 bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700 hover:text-zinc-900"
                onClick={e => {
                  e.stopPropagation()
                  handleLoadDemoData()
                }}
                disabled={isLoadingDemo}
              >
                {isLoadingDemo ? (
                  <>
                    <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                    {t('demo_loading')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    {t('demo_load_button')}
                  </>
                )}
              </Button>

              <p className="text-xs text-zinc-400 text-center">
                {t('demo_hint')}
              </p>
            </div>
          </div>
        </>
      </div>
    </div>
  )
}
