import React, { useEffect, useMemo, useState } from 'react'
import { useWizardStore } from '@/stores/useWizardStore.ts'
import { useProjectStore } from '@/stores/useProjectStore.ts'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Edit3,
  Equal,
  FileSpreadsheet,
  FileText,
  History,
  Info,
  Key,
  Loader2,
  MinusCircle,
  PlusCircle,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group'
import { Label } from '../../ui/label'
import { Input } from '../../ui/input'
import { cleanDisplayName, sanitizeTableName } from '@shared/naming-utils'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/useSettingsStore'

export function FinalizeStep() {
  const {
    tasks,
    currentTaskIndex,
    updateTask,
    mode,
    targetTableId,
    nextTask,
    prevTask,
  } = useWizardStore()
  const { files } = useProjectStore()
  const { isActivated } = useSettingsStore()
  const { t } = useTranslation('common')
  const [isPreChecking, setIsPreChecking] = useState(false)

  const currentTask = tasks[currentTaskIndex]
  const targetFile = files.find(f => f.id === targetTableId)

  // Use PKs from TARGET file for Append Mode, or from Task config for Import Mode
  const pkNames = useMemo(() => {
    if ((mode === 'append' || mode === 'merge') && targetFile) {
      if (mode === 'merge' && currentTask?.mergeKeys) {
        return currentTask.mergeKeys
      }
      return targetFile.columns
        .filter(c => c.isPrimaryKey)
        .map(c => c.name)
    }
    return (
      currentTask?.columns.filter(c => c.isPrimaryKey).map(c => c.name) || []
    )
  }, [mode, targetFile, currentTask?.columns, currentTask?.mergeKeys])

  const preCheck = currentTask?.preCheckResult

  // Compute a stable key for configuration to avoid redundant checks
  const configKey = useMemo(() => {
    if (!currentTask) return ''
    return JSON.stringify({
      path: currentTask.filePath,
      temp: currentTask.tempFilePath,
      keys: pkNames,
      mapping: currentTask.columnMapping,
      source: currentTask.sourceName
    })
  }, [currentTask, pkNames])

  // Trigger Pre-check (for Append/Merge Mode)
  useEffect(() => {
    if (!currentTask || !targetFile || (mode !== 'append' && mode !== 'merge'))
      return
    if (pkNames.length === 0) return
    if (isPreChecking) return

    const runPreCheck = async () => {
      setIsPreChecking(true)
      try {
        const res = await window.electronAPI.ingestPreCheck({
          filePath: currentTask.filePath,
          targetTableName: targetFile.tableName,
          sheetName:
            currentTask.sourceName === currentTask.fileName
              ? undefined
              : currentTask.sourceName,
          uniqueKeys: pkNames,
          columnMapping: currentTask.columnMapping || {},
          tempFilePath: currentTask.tempFilePath,
        })

        if (res.success && res.data) {
          updateTask(currentTaskIndex, { preCheckResult: res.data })
        }
      } catch (err) {
        console.error('Pre-check failed', err)
      } finally {
        setIsPreChecking(false)
      }
    }

    runPreCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, targetFile?.tableName, mode, currentTaskIndex])

  // --- REPLACE MODE DIFF LOGIC ---
  const schemaDiff = useMemo(() => {
    if (mode !== 'replace' || !targetFile || !currentTask) return null

    const originalColumns = targetFile.columns.filter(c => c.name !== '_ws_row_id')
    const newColumns = currentTask.columns.filter(c => c.name !== '_ws_row_id')

    const missing = originalColumns.filter(
      old => !newColumns.some(n => n.name === old.name)
    )
    const added = newColumns.filter(
      n => !originalColumns.some(old => old.name === n.name)
    )
    const kept = originalColumns.filter(old =>
      newColumns.some(n => n.name === old.name)
    )

    return { missing, added, kept }
  }, [mode, targetFile, currentTask])

  if (!currentTask) return null

  const handleRename = (index: number, val: string) => {
    const sanitized = sanitizeTableName(val)
    updateTask(index, { finalTableName: sanitized })
  }

  const strategy = currentTask.conflictStrategy || 'ignore'

  return (
    <div className="h-full flex flex-col overflow-hidden bg-zinc-50/30">
      {/* Header */}
      <div className="px-8 py-4 bg-zinc-100/50 border-b border-zinc-200 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">
              {mode === 'append'
                ? t('wizard.target_decision')
                : mode === 'replace'
                  ? t('wizard.schema_comparison')
                  : mode === 'merge'
                    ? t('wizard.merge_summary_header')
                    : t('wizard.target_configurations')}
            </span>
            <span className="text-sm font-bold text-zinc-900 mt-1">
              {mode === 'append'
                ? t('wizard.appending_to', { name: targetFile?.name })
                : mode === 'replace'
                  ? t('wizard.replacing', { name: targetFile?.name })
                  : mode === 'merge'
                    ? t('wizard.correcting', {
                        name: targetFile?.name,
                      })
                    : t('wizard.assets_pending', { count: tasks.length })}
            </span>
          </div>
        </div>

        {mode === 'append' && tasks.length > 1 && (
          <div className="flex gap-2">
            <button
              onClick={prevTask}
              disabled={currentTaskIndex === 0}
              className="p-1.5 rounded-md hover:bg-zinc-200 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextTask}
              disabled={currentTaskIndex === tasks.length - 1}
              className="p-1.5 rounded-md hover:bg-zinc-200 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Trial Limit Banner */}
          {!isActivated && (
            <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 flex items-start gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-600 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-amber-900 uppercase tracking-tight">
                  {t('wizard.trial_limit_banner_title')}
                </h4>
                <p className="text-xs text-amber-700 font-medium leading-relaxed">
                  {t('wizard.trial_limit_banner_desc')}
                </p>
              </div>
            </div>
          )}

          {mode === 'merge' ? (
            /* --- MERGE MODE: Summary of Matching & Updating --- */
            <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-2">
              <div
                className={cn(
                  'p-8 rounded-[2rem] border-2 transition-all duration-500 text-center relative overflow-hidden',
                  isPreChecking
                    ? 'bg-zinc-50 border-zinc-100'
                    : (preCheck?.duplicateRows || 0) > 0
                      ? 'bg-indigo-50 border-indigo-100'
                      : 'bg-amber-50 border-amber-100'
                )}
              >
                <div className="flex flex-col items-center gap-4 relative z-10">
                  <div
                    className={cn(
                      'w-16 h-16 rounded-full flex items-center justify-center shadow-sm',
                      isPreChecking
                        ? 'bg-zinc-200 text-zinc-400'
                        : (preCheck?.duplicateRows || 0) > 0
                          ? 'bg-indigo-600 text-white'
                          : 'bg-amber-500 text-white'
                    )}
                  >
                    {isPreChecking ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (preCheck?.duplicateRows || 0) > 0 ? (
                      <Wand2 className="w-8 h-8" />
                    ) : (
                      <AlertCircle className="w-8 h-8" />
                    )}{' '}
                  </div>
                  <div>
                    <h4 className="text-2xl font-black uppercase tracking-tight text-zinc-900">
                      {isPreChecking
                        ? t('wizard.analyzing_structure')
                        : (preCheck?.duplicateRows || 0) > 0
                          ? t('wizard.merge_match_found', {
                              count: preCheck?.duplicateRows,
                            })
                          : t('wizard.merge_no_match')}
                    </h4>
                    <p className="text-sm text-zinc-500 font-medium mt-1">
                      {t('wizard.merge_summary_desc')}
                    </p>
                  </div>
                  {!isPreChecking && preCheck && (
                    <div className="mt-2 flex items-center gap-4 text-zinc-400 text-[10px] font-black uppercase tracking-widest">
                      <span>
                        {t('wizard.rows_in_file', {
                          count: preCheck.totalRows,
                        })}
                      </span>
                      <div className="w-1 h-1 rounded-full bg-zinc-200" />
                      <span>
                        {t('wizard.match_count', {
                          count: preCheck.duplicateRows,
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest text-center">
                    {t('wizard.match_by')}
                  </h4>
                  <div className="flex flex-wrap justify-center gap-2">
                    {(currentTask.mergeKeys || []).map(keyName => (
                      <span
                        key={keyName}
                        className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-700 flex items-center gap-2"
                      >
                        <Key className="w-3 h-3" /> {keyName}
                      </span>
                    ))}
                    {(currentTask.mergeKeys || []).length === 0 && (
                      <span className="text-xs text-rose-500 font-bold italic">
                        {t('wizard.no_keys_selected')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest text-center">
                    {t('wizard.update_columns')}
                  </h4>
                  <div className="flex flex-wrap justify-center gap-2">
                    {Object.entries(currentTask.columnMapping || {})
                      .filter(
                        ([target, source]) =>
                          source &&
                          !(currentTask.mergeKeys || []).includes(target)
                      )
                      .map(([target]) => (
                        <span
                          key={target}
                          className="px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-2"
                        >
                          <Edit3 className="w-3 h-3" /> {target}
                        </span>
                      ))}
                    {Object.entries(currentTask.columnMapping || {}).filter(
                      ([target, source]) =>
                        source &&
                        !(currentTask.mergeKeys || []).includes(target)
                    ).length === 0 && (
                      <span className="text-xs text-rose-500 font-bold italic">
                        {t('wizard.no_columns_to_update')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : mode === 'import' ? (
            /* --- IMPORT MODE: Multi-Task List --- */
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_20px_1fr_20px_1fr] px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                <span>{t('wizard.configuring_asset')}</span>
                <span />
                <span>{t('wizard.target_display_name', 'Display Name')}</span>
                <span />
                <span>{t('wizard.target_table')}</span>
              </div>

              <div className="space-y-3">
                {tasks.map((task, idx) => {
                  const isTaken = files.some(
                    f => f.tableName === task.finalTableName
                  )
                  const isTruncated = !isActivated && task.rowCount > 50000
                  const displayNameBase = cleanDisplayName(task.fileName, task.sourceName)

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'group flex items-center gap-4 bg-white border p-4 rounded-2xl shadow-sm transition-all relative overflow-hidden',
                        isTruncated
                          ? 'border-amber-200 ring-2 ring-amber-50'
                          : 'border-zinc-200 hover:border-indigo-200'
                      )}
                    >
                      <div className="flex-1 flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center shrink-0">
                          {task.fileName.endsWith('.csv') ? (
                            <FileText className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-zinc-900 truncate">
                            {task.sourceName === task.fileName ? cleanDisplayName(task.fileName) : task.sourceName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-zinc-400 truncate">
                              {task.fileName}
                            </p>
                            {isTruncated && (
                              <span className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {t('wizard.truncated_hint')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-200 shrink-0" />
                      <div className="flex-1">
                        <Input
                          value={task.finalDisplayName || ''}
                          placeholder={displayNameBase}
                          onChange={e =>
                            updateTask(idx, {
                              finalDisplayName: e.target.value,
                            })
                          }
                          className="h-9 text-sm font-medium border-zinc-200 bg-zinc-50 focus-visible:ring-0 focus-visible:border-indigo-300 transition-all"
                        />
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-200 shrink-0" />
                      <div className="flex-1 flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'flex-1 flex items-center gap-2 px-3 py-1.5 rounded-md border-2 transition-all',
                            isTaken
                              ? 'bg-rose-50 border-rose-200'
                              : 'bg-zinc-50 border-zinc-200 group-hover:border-indigo-300'
                          )}
                        >
                          <Database
                            className={cn(
                              'w-3.5 h-3.5',
                              isTaken ? 'text-rose-500' : 'text-zinc-400'
                            )}
                          />
                          <Input
                            value={task.finalTableName || ''}
                            onChange={e => handleRename(idx, e.target.value)}
                            className="h-6 text-sm font-mono font-bold p-0 border-none bg-transparent focus-visible:ring-0 shadow-none"
                          />
                          {isTaken ? (
                            <div title={t('wizard.name_taken')}>
                              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                            </div>
                          ) : (
                            <Edit3 className="w-3 h-3 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : mode === 'replace' ? (
            /* --- REPLACE MODE: Schema Diff --- */
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
              {schemaDiff && schemaDiff.missing.length > 0 && (
                <div className="bg-rose-50 border-2 border-rose-100 rounded-2xl p-6 flex items-start gap-4">
                  <div className="p-2 bg-rose-100 rounded-lg text-rose-600 shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-rose-900">
                      {t('wizard.breaking_changes_title')}
                    </h4>
                    <p className="text-sm text-rose-700 mt-1">
                      {t('wizard.breaking_changes_desc')}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {schemaDiff.missing.map(col => (
                        <span
                          key={col.name}
                          className="px-2 py-1 bg-white border border-rose-200 rounded text-xs font-mono font-bold text-rose-700 flex items-center gap-1.5"
                        >
                          <MinusCircle className="w-3 h-3" />
                          {col.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-8">
                {/* LEFT: Original */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                    {t('wizard.original_schema')}
                  </h4>
                  <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm space-y-2 opacity-60 pointer-events-none grayscale">
                    {targetFile?.columns
                      .filter(col => col.name !== '_ws_row_id')
                      .map(col => (
                        <div
                          key={col.name}
                          className="flex items-center justify-between text-sm py-1 border-b border-zinc-50 last:border-0"
                        >
                        <span className="font-mono text-zinc-600">
                          {col.name}
                        </span>
                        <span className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-500">
                          {col.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT: New */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                    {t('wizard.new_schema')}
                  </h4>
                  <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm space-y-2">
                    {/* Added */}
                    {schemaDiff?.added.map(col => (
                      <div
                        key={col.name}
                        className="flex items-center justify-between text-sm py-2 px-3 bg-emerald-50 border border-emerald-100 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-mono font-bold text-emerald-900">
                            {col.name}
                          </span>
                        </div>
                        <span className="text-[10px] bg-white border border-emerald-200 px-1.5 py-0.5 rounded text-emerald-700">
                          {col.type}
                        </span>
                      </div>
                    ))}

                    {/* Kept */}
                    {schemaDiff?.kept.map(col => (
                      <div
                        key={col.name}
                        className="flex items-center justify-between text-sm py-1 border-b border-zinc-50 last:border-0 px-2"
                      >
                        <div className="flex items-center gap-2">
                          <Equal className="w-3 h-3 text-zinc-300" />
                          <span className="font-mono text-zinc-700">
                            {col.name}
                          </span>
                        </div>
                        <span className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-500">
                          {col.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {!schemaDiff?.missing.length && !schemaDiff?.added.length && (
                <div className="text-center p-8 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-bold text-zinc-700">
                    {t('wizard.perfect_match_title')}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {t('wizard.perfect_match_desc')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* --- APPEND MODE: High Density UI --- */
            <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-2">
              {/* Conflict Status Card */}
              {pkNames.length > 0 ? (
                <div
                  className={cn(
                    'p-8 rounded-[2rem] border-2 transition-all duration-500 text-center relative overflow-hidden',
                    isPreChecking
                      ? 'bg-zinc-50 border-zinc-100'
                      : (preCheck?.duplicateRows || 0) > 0
                        ? 'bg-rose-50 border-rose-100'
                        : 'bg-emerald-50 border-emerald-100'
                  )}
                >
                  <div className="flex flex-col items-center gap-4 relative z-10">
                    <div
                      className={cn(
                        'w-16 h-16 rounded-full flex items-center justify-center shadow-sm',
                        isPreChecking
                          ? 'bg-zinc-200'
                          : (preCheck?.duplicateRows || 0) > 0
                            ? 'bg-rose-500 text-white'
                            : 'bg-emerald-500 text-white'
                      )}
                    >
                      {isPreChecking ? (
                        <Loader2 className="w-8 h-8 animate-spin" />
                      ) : (preCheck?.duplicateRows || 0) > 0 ? (
                        <AlertCircle className="w-8 h-8" />
                      ) : (
                        <CheckCircle2 className="w-8 h-8" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-2xl font-black uppercase tracking-tight text-zinc-900">
                        {isPreChecking
                          ? t('wizard.analyzing_conflicts')
                          : (preCheck?.duplicateRows || 0) > 0
                            ? t('wizard.conflicts_found', {
                                count: preCheck?.duplicateRows,
                              })
                            : t('wizard.no_conflicts')}
                      </h4>
                      <p className="text-sm text-zinc-500 font-medium mt-1">
                        {t('wizard.matching_keys')}{' '}
                        <span className="font-bold text-indigo-600">
                          {pkNames.join(', ')}
                        </span>
                      </p>
                    </div>
                    {!isPreChecking && preCheck && (
                      <div className="mt-2 flex items-center gap-4 text-zinc-400 text-[10px] font-black uppercase tracking-widest">
                        <span>
                          {t('wizard.rows_in_file', {
                            count: preCheck.totalRows,
                          })}
                        </span>
                        <div className="w-1 h-1 rounded-full bg-zinc-200" />
                        <span>
                          {t('wizard.existing_rows', {
                            count: preCheck.duplicateRows,
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 border-2 border-dashed border-amber-200 bg-amber-50/30 rounded-[2rem] flex flex-col items-center text-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                    <Info className="w-6 h-6" />
                  </div>
                  <div className="max-w-xs">
                    <h4 className="text-lg font-bold text-amber-900 uppercase tracking-tight">
                      {t('wizard.no_unique_key')}
                    </h4>
                    <p className="text-xs text-amber-700 mt-1 font-medium leading-normal">
                      {t('wizard.no_unique_key_desc')}
                    </p>
                  </div>
                </div>
              )}

              {/* Strategy Selection - Optimized */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-zinc-400 justify-center">
                  <div className="h-px w-12 bg-zinc-200" />
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">
                    Conflict Strategy
                  </h4>
                  <div className="h-px w-12 bg-zinc-200" />
                </div>

                <RadioGroup
                  value={strategy}
                  onValueChange={val =>
                    updateTask(currentTaskIndex, {
                      conflictStrategy: val as any,
                    })
                  }
                  className="grid grid-cols-1 gap-3"
                >
                  <Label
                    htmlFor="strat-ignore"
                    className={cn(
                      'flex items-center justify-between p-5 border transition-all cursor-pointer rounded-2xl group',
                      strategy === 'ignore'
                        ? 'bg-indigo-50/50 border-indigo-200 ring-4 ring-indigo-50'
                        : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-sm'
                    )}
                  >
                    <div className="flex items-center gap-5">
                      <RadioGroupItem
                        value="ignore"
                        id="strat-ignore"
                        className="sr-only"
                      />
                      <div
                        className={cn(
                          'w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-sm',
                          strategy === 'ignore'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-zinc-100 text-zinc-400 group-hover:bg-zinc-200'
                        )}
                      >
                        <History className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col text-left">
                        <span
                          className={cn(
                            'text-base font-bold',
                            strategy === 'ignore'
                              ? 'text-indigo-900'
                              : 'text-zinc-900'
                          )}
                        >
                          {t('wizard.strategy_ignore_title')}
                        </span>
                        <span className="text-xs text-zinc-500 font-medium leading-relaxed max-w-sm">
                          {t('wizard.strategy_ignore_desc')}
                        </span>
                      </div>
                    </div>
                    {strategy === 'ignore' ? (
                      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center shadow-sm">
                        <Check className="w-4 h-4 text-white stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-zinc-100 group-hover:border-zinc-200" />
                    )}
                  </Label>

                  <Label
                    htmlFor="strat-replace"
                    className={cn(
                      'flex items-center justify-between p-5 border transition-all cursor-pointer rounded-2xl group',
                      strategy === 'replace'
                        ? 'bg-indigo-50/50 border-indigo-200 ring-4 ring-indigo-50'
                        : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-sm'
                    )}
                  >
                    <div className="flex items-center gap-5">
                      <RadioGroupItem
                        value="replace"
                        id="strat-replace"
                        className="sr-only"
                      />
                      <div
                        className={cn(
                          'w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-sm',
                          strategy === 'replace'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-zinc-100 text-zinc-400 group-hover:bg-zinc-200'
                        )}
                      >
                        <Copy className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col text-left">
                        <span
                          className={cn(
                            'text-base font-bold',
                            strategy === 'replace'
                              ? 'text-indigo-900'
                              : 'text-zinc-900'
                          )}
                        >
                          {t('wizard.strategy_replace_title')}
                        </span>
                        <span className="text-xs text-zinc-500 font-medium leading-relaxed max-w-sm">
                          {t('wizard.strategy_replace_desc')}
                        </span>
                      </div>
                    </div>
                    {strategy === 'replace' ? (
                      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center shadow-sm">
                        <Check className="w-4 h-4 text-white stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-zinc-100 group-hover:border-zinc-200" />
                    )}
                  </Label>
                </RadioGroup>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
