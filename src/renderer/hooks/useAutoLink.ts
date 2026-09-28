import { useCallback } from 'react'
import { useProjectStore } from '../stores/useProjectStore'
import { useContextAnalysis } from './useIPC'
import { useToastStore } from '../stores/useToastStore'
import type { FileNode } from '../../shared/types'
import { useWorkbenchStore } from '../stores/useWorkbenchStore'
import { useTranslation } from 'react-i18next'
import { mapFileToSchema } from '../utils/schema-mapper'

export function useAutoLink() {
  const analysisMutation = useContextAnalysis()
  const { addToast } = useToastStore()
  const { language: currentLanguage } = useWorkbenchStore.getState()
  const { t } = useTranslation('chat')

  // Entry point: Just opens the modal
  const openSmartModeling = useCallback(async () => {
    // Pre-check AI config before opening
    let apiKey: string | undefined
    try {
      const configRes = await window.electronAPI.getAIConfig()
      if (configRes.success && configRes.data) {
        apiKey = configRes.data.apiKey
      }
    } catch (e) {
      console.error('Failed to check AI config for auto-link', e)
    }

    if (!apiKey) {
      addToast({
        title: t('auto_link_analysis_failed_title'),
        description: t('auto_link_missing_api_key_desc'),
        type: 'error',
        duration: 10000,
        action: {
          label: t('settings', { ns: 'common' }),
          onClick: () => {
            // Trigger global settings dialog
            document.dispatchEvent(new CustomEvent('open-settings', { detail: 'ai' }))
          },
        },
      })
      return
    }

    useProjectStore.getState().setSmartModelingOpen(true)
  }, [addToast, t])

  // Execution: Runs AI analysis
  const runAnalysis = useCallback(
    async (currentFiles?: FileNode[]) => {
      const store = useProjectStore.getState()
      const filesToUse = currentFiles || store.files
      const setAnalysisReviewResult = store.setAnalysisReviewResult
      const language = currentLanguage || 'en'

      if (filesToUse.length === 0) {
        console.log('No files to analyze')
        return
      }

      const schemas = filesToUse.map(f =>
        mapFileToSchema(f, filesToUse, { 
          skipMetrics: true, 
          skipRelations: true,
          disableMasking: true 
        })
      )

      try {
        const result = await analysisMutation.mutateAsync({
          schemas,
          language,
        })
        console.log('AI Analysis Result:', result)

        setAnalysisReviewResult(result)
      } catch (error) {
        console.error('Auto-link failed:', error)
        addToast({
          title: t('auto_link_error_title'),
          description: t('auto_link_error_desc'),
          type: 'error',
        })
      }
    },
    [analysisMutation, addToast, currentLanguage, t]
  )

  return {
    checkAutoLink: openSmartModeling, // Alias for UI triggers
    runAnalysis,
    isAnalyzing: analysisMutation.isPending,
  }
}
