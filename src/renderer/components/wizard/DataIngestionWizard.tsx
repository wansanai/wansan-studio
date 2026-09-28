import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useWizardStore } from '../../stores/useWizardStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useUIStore } from '../../stores/useUIStore'
import { Steps } from './Steps'
import { Button } from '../ui/button'
import { useTranslation } from 'react-i18next'
import { FileSelectionStep } from './steps/FileSelectionStep'
import { DataPreviewStep } from './steps/DataPreviewStep'
import { FinalizeStep } from './steps/FinalizeStep'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useToastStore } from '../../stores/useToastStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { Analytics } from '../../services/analytics'
import { useProGate } from '@/hooks/use-pro-gate'
import { sanitizeTableName, cleanDisplayName } from '@shared/naming-utils'
import type { ColumnSchema, DataSourceConfig } from '@shared/types'

const TRIAL_ROW_LIMIT = 50000
const TRIAL_FILE_LIMIT = 3

function getErrorStack(error: unknown): string {
  return error instanceof Error && error.stack ? error.stack : String(error)
}

export function DataIngestionWizard() {
  const {
    isOpen,
    close,
    step,
    setStep,
    tasks,
    currentTaskIndex,
    nextTask,
    prevTask,
    isProcessing,
    setProcessing,
    mode,
    targetTableId,
    tempTableNames,
  } = useWizardStore()
  const { files, addFile, updateFile, setView } = useProjectStore()
  const { isActivated } = useSettingsStore()
  const { checkGate, gateNode } = useProGate()
  const { t } = useTranslation('common')
  const toast = useToastStore()

  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<{
    title: string;
    message: string;
  } | null>(null)

  const handleCancel = async () => {
    // Collect temp files from all tasks
    const tempFiles = tasks.map(t => t.tempFilePath).filter(Boolean) as string[]

    if (tempTableNames.length > 0 || tempFiles.length > 0) {
      try {
        await window.electronAPI.cleanupIngestion({ tempTableNames, tempFilePaths: tempFiles })
      } catch (e) {
        console.error('Failed to cleanup staging tables/files', e)
      }
    }
    Analytics.track('ingest_wizard_cancelled', { step, mode })
    close()
  }

  const handleFinish = async () => {
    // Trial check: Limit total files to 3
    if (mode === 'import' && !isActivated) {
      if (files.length + tasks.length > TRIAL_FILE_LIMIT) {
        checkGate(t('trial_limit_reached_title'), () => {})
        return
      }
    }

    setProcessing(true)
    const limitRows = isActivated ? undefined : TRIAL_ROW_LIMIT

    try {
      const addedFileIds: string[] = []
      const finalizedTempTables = new Set<string>()

      for (const task of tasks) {
        if ((mode === 'append' || mode === 'merge') && targetTableId) {
          const targetFile = files.find(f => f.id === targetTableId)
          if (!targetFile) continue

          const pkNames =
            mode === 'merge'
              ? task.mergeKeys || []
              : mode === 'append'
                ? targetFile.columns
                    .filter(c => c.isPrimaryKey)
                    .map(c => c.name)
                : task.columns.filter(c => c.isPrimaryKey).map(c => c.name)

          const result = await window.electronAPI.appendData({
            filePath: task.filePath,
            targetTableName: targetFile.tableName,
            sheetName:
              task.sourceName === task.fileName ? undefined : task.sourceName,
            uniqueKeys: pkNames,
            strategy:
              mode === 'merge' ? 'update' : task.conflictStrategy || 'ignore',
            columnMapping: task.columnMapping || {},
            tempFilePath: task.tempFilePath, // Pass cached CSV path
            limitRows,
            readOptions: task.readOptions,
          })

          if (result.success && result.data) {
            updateFile(targetFile.id, { rowCount: result.data.rowCount })
          } else {
            throw new Error(result.error || 'Operation failed')
          }
          finalizedTempTables.add(task.tableName)
        } else if (mode === 'replace' && targetTableId) {
          // --- REPLACE MODE ---
          const targetFile = files.find(f => f.id === targetTableId)
          if (!targetFile)
            throw new Error('Target file not found for replacement')

          // Reuse table name to overwrite
          const finalTableName = targetFile.tableName

          const result = await window.electronAPI.createTableFromSource({
            filePath: task.filePath,
            tableName: finalTableName,
            sheetName:
              task.sourceName === task.fileName ? undefined : task.sourceName,
            columns: task.columns.map(c => ({ name: c.name, type: c.type })),
            tempFilePath: task.tempFilePath,
            limitRows,
            readOptions: task.readOptions,
          })

          if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to replace table')
          }

          finalizedTempTables.add(task.tableName)

          const columns = result.data.columns
            .filter(c => c.name !== '_ws_row_id')
            .map(c => {
              // Try to preserve key status if column name matches
              const oldCol = targetFile.columns.find(old => old.name === c.name)
              return {
                name: c.name,
                safeName: c.name,
                type: c.type,
                sampleValues: c.sampleValues || [],
                isPrimaryKey: oldCol ? oldCol.isPrimaryKey : false,
              }
            })

          const displayName =
            task.finalDisplayName || cleanDisplayName(task.fileName, task.sourceName)

          // Construct structured source config
          const sourceConfig: DataSourceConfig = task.connectionId ? {
            type: 'database',
            connectionId: task.connectionId,
            table: task.originalTableName || '',
            schema: task.dbSchema
          } : {
            type: 'local_file',
            path: task.filePath,
            subResource: task.sourceName === task.fileName ? undefined : task.sourceName,
            readOptions: task.readOptions
          }

          // Use reloadFile to safely update schema and validate relations
          useProjectStore.getState().reloadFile(targetFile.id, {
            lastModified: Date.now(),
            newColumns: columns as ColumnSchema[],
          })

          // Update other metadata that reloadFile doesn't handle
          updateFile(targetFile.id, {
            source: sourceConfig, // [REFACTOR] Update structured source
            name: task.finalDisplayName || displayName,
            rowCount: result.data.rowCount,
          })

          addedFileIds.push(targetFile.id)
        } else {
          // --- IMPORT MODE ---
          const finalTableName =
            task.finalTableName || sanitizeTableName(task.tableName.replace('temp_ingest_', ''))

          const result = await window.electronAPI.createTableFromSource({
            filePath: task.filePath,
            tableName: finalTableName,
            sheetName:
              task.sourceName === task.fileName ? undefined : task.sourceName,
            columns: task.columns.map(c => ({
              name: c.name,
              type: c.type,
              isIgnored: c.isIgnored,
            })),
            tempFilePath: task.tempFilePath, // Pass cached CSV path
            limitRows,
            readOptions: task.readOptions,
          })

          if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to create table')
          }

          finalizedTempTables.add(task.tableName)

          // Map backend schema (with fresh samples) to frontend file model
          const columns = result.data.columns
            .filter(c => c.name !== '_ws_row_id')
            .map(c => {
              const userConfig = task.columns.find(uc => uc.name === c.name)
              return {
                name: c.name,
                safeName: c.name,
                type: c.type,
                sampleValues: c.sampleValues || [], // Use fresh samples from DB
                isKey: userConfig?.isPrimaryKey || false,
                isPrimaryKey: userConfig?.isPrimaryKey || false,
                semantic: userConfig?.description ? { description: userConfig.description } : undefined // [NEW] Persist description
              }
            })

          // Construct a friendly display name
          const displayName =
            task.finalDisplayName || cleanDisplayName(task.fileName, task.sourceName)

          // Construct structured source config
          const sourceConfig: DataSourceConfig = task.connectionId ? {
            type: 'database',
            connectionId: task.connectionId,
            table: task.originalTableName || '',
            schema: task.dbSchema
          } : {
            type: 'local_file',
            path: task.filePath,
            subResource: task.sourceName === task.fileName ? undefined : task.sourceName,
            readOptions: task.readOptions
          }

          const fileId = addFile({
            name: task.finalDisplayName || displayName,
            tableName: finalTableName,
            source: sourceConfig, // [REFACTOR]
            status: 'ready',
            columns: columns as ColumnSchema[],
            rowCount: result.data.rowCount,
          })
          addedFileIds.push(fileId)
        }
      }

      const tablesToClean = tempTableNames.filter(
        name => !finalizedTempTables.has(name)
      )

      // Also clean up temp files for tasks that were NOT finalized
      // (Though createTableFromSource cleans up on success, if we skipped any task here, we should clean its file)
      const filesToClean = tasks
        .filter(t => !finalizedTempTables.has(t.tableName))
        .map(t => t.tempFilePath)
        .filter(Boolean) as string[]

      if (tablesToClean.length > 0 || filesToClean.length > 0) {
        await window.electronAPI.cleanupIngestion({ tempTableNames: tablesToClean, tempFilePaths: filesToClean })
      }

      if (addedFileIds.length > 0) {
        // Show modeling confirmation instead of auto-triggering
        useProjectStore.getState().setSmartModelingOpen(true)
      }

      setView('schema')

      Analytics.track('ingest_wizard_completed', {
        mode,
        file_count: tasks.length,
      })

      toast.addToast({
        title:
          mode === 'append'
            ? t('wizard.append_success')
            : mode === 'merge'
              ? t('wizard.merge_success', 'Data corrected successfully')
              : t('wizard.import_success'),
        type: 'success',
        duration: 3000,
      })

      close()
    } catch (e: unknown) {
      console.error('Final ingestion failed', e)
      useUIStore
        .getState()
        .showError(
          t('wizard.ingestion_failed'),
          t('chat:error_processing_request'),
          getErrorStack(e)
        )
    } finally {
      setProcessing(false)
    }
  }

  const handleNext = async () => {
    // Multi-task navigation within a step
    if (step === 'preview') {
      const currentTask = tasks[currentTaskIndex]
      if (currentTask) {
        setIsValidating(true)
        try {
          const res = await window.electronAPI.validateColumnTypes({
            filePath: currentTask.filePath,
            tempFilePath: currentTask.tempFilePath,
            columns: currentTask.columns.map(c => ({
              name: c.name,
              type: c.type,
            })),
            readOptions: currentTask.readOptions,
          })

          if (!res.success || !res.data?.valid) {
            const rawError = res.error || res.data?.error || ''
            const detail = res.data?.errorDetail
            const displayTitle = t('wizard.type_validation_failed')
            let displayDesc = rawError.split('\n')[0]

            if (detail) {
              displayDesc = t('wizard.type_conversion_error', {
                column: detail.column,
                value: detail.value,
                type: detail.type,
              })
            }

            setValidationError({ title: displayTitle, message: displayDesc })
            setIsValidating(false)
            return // Block navigation
          }
        } catch (e) {
          console.error(e)
          setIsValidating(false)
          return
        }
        setIsValidating(false)
      }

      const isLastTask = currentTaskIndex === tasks.length - 1
      if (!isLastTask) {
        nextTask()
        return
      }
    }

    // Step transitions
    if (step === 'select') {
      const isSyncing = tasks.some(t => t.status === 'syncing' || t.status === 'waiting_for_sync')
      const hasErrors = tasks.some(t => t.status === 'error')

      if (isSyncing) {
        // UI is already showing loading state, just block navigation
        return
      }

      if (hasErrors) {
        useUIStore.getState().showError(t('wizard.fix_errors'), 'Please remove failed tasks before proceeding.')
        return
      }

      if (tasks.length === 0) return

      setStep('preview')
    } else if (step === 'preview') {
      setStep('finalize')
    } else if (step === 'finalize') {
      await handleFinish()
    }
  }

  const handleBack = () => {
    if (step === 'preview') {
      if (currentTaskIndex > 0) {
        prevTask()
        return
      }
    }
    if (step === 'preview') setStep('select')
    else if (step === 'finalize') setStep('preview')
  }

  const isNextDisabled = useMemo(() => {
    const currentTask = tasks[currentTaskIndex]
    if (step === 'select') {
      const baseDisabled = tasks.length === 0 || tasks.some(t => t.status !== 'ready')
      if (mode !== 'import') {
        return baseDisabled || tasks.length !== 1
      }
      return baseDisabled
    }
    if (!currentTask) return true

    if (step === 'preview' && mode === 'merge') {
      const hasMergeKeys = (currentTask.mergeKeys || []).length > 0
      const hasUpdateColumns = Object.entries(currentTask.columnMapping || {}).some(
        ([targetCol, sourceCol]) => sourceCol !== null && !(currentTask.mergeKeys || []).includes(targetCol)
      )
      return !hasMergeKeys || !hasUpdateColumns
    }

    if (step === 'preview' && mode === 'append') {
      const hasMappings = Object.values(currentTask.columnMapping || {}).some(source => source !== null)
      return !hasMappings
    }

    if (step === 'finalize' && mode === 'import') {
      const collisionWithFiles = files.some(f => f.tableName === currentTask.finalTableName)
      const collisionWithTasks = tasks.some((t, idx) => idx !== currentTaskIndex && t.finalTableName === currentTask.finalTableName)
      return !currentTask?.finalTableName || collisionWithFiles || collisionWithTasks
    }
    return false
  }, [step, tasks, currentTaskIndex, mode, files])

  const isSyncing = tasks.some(t => t.status === 'syncing')

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleCancel()}>
      <DialogContent
        className="max-w-6xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden shadow-2xl border-none"
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <div className="pl-8 pr-12 py-6 border-b border-zinc-100 bg-white flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold tracking-tight uppercase text-zinc-900">
            {t('wizard.title')}
          </h2>
          <Steps currentStep={step} />
        </div>

        <div className="flex-1 overflow-hidden bg-zinc-50/50 relative">
          {step === 'select' && <FileSelectionStep />}
          {step === 'preview' && <DataPreviewStep />}
          {step === 'finalize' && <FinalizeStep />}

          {isProcessing && (
            <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4 animate-in fade-in">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
              <span className="text-sm font-bold text-zinc-900 uppercase tracking-widest">
                {t('wizard.processing')}
              </span>
            </div>
          )}
        </div>

        <div className="px-8 py-5 border-t border-zinc-100 bg-white flex justify-between shrink-0">
          <Button variant="ghost" onClick={handleCancel} className="text-zinc-500">
            {t('cancel')}
          </Button>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={(step === 'select' && currentTaskIndex === 0) || isSyncing}
              className="border-zinc-200"
            >
              {t('wizard.back')}
            </Button>
            <Button
              onClick={handleNext}
              disabled={isNextDisabled || isValidating || isSyncing}
              className="bg-black hover:bg-zinc-800 text-white px-8 font-bold"
            >
              {(isValidating || isSyncing) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {step === 'finalize'
                ? mode === 'append' ? t('wizard.append_now') : mode === 'replace' ? t('wizard.replace_now') : mode === 'merge' ? t('wizard.merge_now') : t('wizard.import_now')
                : tasks.length > 1 && step === 'preview' && currentTaskIndex < tasks.length - 1 ? t('wizard.next_task') : t('wizard.next')}
            </Button>
          </div>
        </div>
      </DialogContent>

      <Dialog open={!!validationError} onOpenChange={open => !open && setValidationError(null)}>
        <DialogContent className="max-w-md p-6">
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-zinc-900">{validationError?.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{validationError?.message}</p>
            </div>
            <Button className="mt-2 w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold" onClick={() => setValidationError(null)}>
              {t('confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {gateNode}
    </Dialog>
  )
}
