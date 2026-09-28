import { useEffect, useMemo, useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { ColumnType, FileNode, SmartMetric } from '@shared/types'
import { getVisibleColumns } from '@shared/utils/schema-utils'
import { useProjectStore } from '../../stores/useProjectStore'
import {
  AlertCircle,
  Calculator,
  Check,
  Database,
  Link2,
  Play,
  Wand2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { getJoinedColumnName } from '@shared/naming-utils'
import { DuckDBViewManager } from '../../lib/duckdb-view-manager'
import { useTranslation } from 'react-i18next'
import { CodeEditor } from '../ui/CodeEditor'

interface MetricEditorModalProps {
  isOpen: boolean
  onClose: () => void
  file: FileNode
  initialMetric?: SmartMetric
  onSave: (metric: SmartMetric) => void
}

export function MetricEditorModal({
  isOpen,
  onClose,
  file,
  initialMetric,
  onSave,
}: MetricEditorModalProps) {
  // const { t } = useTranslation('common')
  const { t: tAnalysis } = useTranslation('analysis')
  const files = useProjectStore(s => s.files)
  const editorRef = useRef<any>(null)

  // States
  const [name, setName] = useState('')
  const [safeName, setSafeName] = useState('')
  const [expression, setExpression] = useState('')
  const [type, setType] = useState<ColumnType>('DECIMAL')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const relations = useMemo(() => {
    return files.flatMap(f =>
      (f.relations || []).map(r => ({
        id: r.id,
        fileAId: f.id,
        columnA: r.sourceColumn,
        fileBId: r.targetFileId,
        columnB: r.targetColumn,
        autoDetected: r.autoDetected,
      }))
    )
  }, [files])

  // Reset state when modal opens or initialMetric changes
  useEffect(() => {
    if (isOpen) {
      if (initialMetric) {
        setName(initialMetric.name)
        setSafeName(initialMetric.safeName || '')
        setExpression(initialMetric.sqlExpression)
        setType(initialMetric.type || 'DECIMAL')
      } else {
        setName('')
        setSafeName('')
        setExpression('')
        setType('DECIMAL')
      }
      setTestResult(null)
      setTestError(null)
      setIsGenerating(false)
    }
  }, [isOpen, initialMetric])

  // Auto-generate safeName from name if not editing
  useEffect(() => {
    if (!initialMetric && name) {
      const generated = name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
      setSafeName(generated)
    }
  }, [name, initialMetric])

  // Clear test feedback when expression changes
  useEffect(() => {
    setTestResult(null)
    setTestError(null)
  }, [expression])

  // Compute available columns grouped by source
  const columnGroups = useMemo(() => {
    const groups: {
      title: string
      icon: typeof Database
      columns: { name: string; type: string; source: string }[]
    }[] = []

    // 1. Native Columns
    groups.push({
      title: tAnalysis('smart_metric.current_table'),
      icon: Database,
      columns: getVisibleColumns(file.columns)
        .map(col => ({
          name: col.name,
          type: col.type,
          source: file.tableName,
        })),
    })

    // 2. Joined Columns
    const relevantRelations = relations.filter(r => r.fileAId === file.id)
    relevantRelations.forEach(rel => {
      const targetFile = files.find(f => f.id === rel.fileBId)
      if (targetFile) {
        const prefix = rel.columnA
        groups.push({
          title: `${tAnalysis('smart_metric.linked_via')} ${prefix}`,
          icon: Link2,
          columns: getVisibleColumns(targetFile.columns)
            .map(col => ({
              name: getJoinedColumnName(prefix, col.name),
              type: col.type,
              source: targetFile.tableName,
            })),
        })
      }
    })

    return groups
  }, [file, files, relations, tAnalysis])

  const validateAndSave = async () => {
    if (!name || !expression) return

    setIsTesting(true)
    setTestError(null)

    try {
      // Run validation before saving
      const result = await DuckDBViewManager.testMetricExpression(
        file,
        expression,
        files,
        relations
      )

      const newMetric: SmartMetric = {
        id: initialMetric?.id || crypto.randomUUID(),
        name: name.trim(),
        safeName: safeName.trim(),
        sqlExpression: expression,
        type: result.dataType as ColumnType,
      }

      await onSave(newMetric)
      onClose()
    } catch (e: any) {
      setTestError(e.message || tAnalysis('smart_metric.validation_failed'))
    } finally {
      setIsTesting(false)
    }
  }

  const handleManualTest = async () => {
    if (!expression) return
    setIsTesting(true)
    setTestResult(null)
    setTestError(null)

    try {
      const result = await DuckDBViewManager.testMetricExpression(
        file,
        expression,
        files,
        relations
      )

      if (result.value !== undefined) {
        setTestResult(String(result.value ?? '(null)'))
        setType(result.dataType as ColumnType)
      } else {
        setTestResult(tAnalysis('smart_metric.no_rows'))
      }
    } catch (e: any) {
      setTestError(e.message || tAnalysis('smart_metric.syntax_error'))
    } finally {
      setIsTesting(false)
    }
  }

  const handleAiGenerate = async () => {
    const isRefining = !!expression.trim()
    const input = isRefining ? expression : name

    if (!input.trim()) return

    setIsGenerating(true)
    try {
      const contextColumns = columnGroups.flatMap(g =>
        g.columns.map(c => ({ name: c.name, type: c.type }))
      )

      const result = await window.electronAPI.generateMetricExpression({
        input,
        columns: contextColumns,
        mode: isRefining ? 'refine' : 'generate',
      })

      if (result.success && result.data) {
        setExpression(result.data)
      }
    } catch (err) {
      console.error('AI Generation failed', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const insertAtCursor = (text: string) => {
    const textToInsert = `"${text}"`

    if (!editorRef.current) {
      setExpression(prev => prev + textToInsert)
      return
    }

    const editor = editorRef.current
    const selection = editor.getSelection()
    const range = {
      startLineNumber: selection.startLineNumber,
      startColumn: selection.startColumn,
      endLineNumber: selection.endLineNumber,
      endColumn: selection.endColumn,
    }

    editor.executeEdits('wansan-insert', [
      {
        range,
        text: textToInsert,
        forceMoveMarkers: true,
      },
    ])
    editor.focus()
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b shrink-0 bg-white">
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-purple-600" />
            {initialMetric
              ? tAnalysis('smart_metric.edit_title')
              : tAnalysis('smart_metric.add_title')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex min-h-0 bg-zinc-50/30">
          <div className="flex-1 flex flex-col min-w-0 bg-white shadow-sm">
            <div className="p-6 pb-0 flex flex-col gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-zinc-500 uppercase">
                  {tAnalysis('smart_metric.display_label')}
                </Label>
                <Input
                  placeholder="e.g. Profit Margin %"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="focus:outline-none focus-within:border-purple-300 transition-colors focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                />
              </div>
            </div>

            <div className="flex-1 p-6 flex flex-col min-h-0 gap-2">
              <div className="flex justify-between items-center">
                <Label className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase">
                  <span>{tAnalysis('smart_metric.sql_expression')}</span>
                  <span className="text-[10px] text-zinc-400 font-normal normal-case border-l border-zinc-200 pl-2">
                    {tAnalysis('smart_metric.duckdb_syntax')}
                  </span>
                </Label>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-purple-600 hover:bg-purple-50 hover:text-purple-700 text-[11px] font-bold"
                  onClick={handleAiGenerate}
                  disabled={isGenerating || (!expression.trim() && !name.trim())}
                >
                  <Wand2
                    className={cn('w-3.5 h-3.5', isGenerating && 'animate-spin')}
                  />
                  {isGenerating
                    ? tAnalysis('smart_metric.generating')
                    : tAnalysis('smart_metric.ai_magic')}
                </Button>
              </div>

              <div className="flex-1 border border-zinc-200 rounded-lg bg-white overflow-hidden relative flex flex-col focus-within:border-purple-300 transition-colors">
                <div className="flex-1 overflow-hidden relative">
                  <CodeEditor
                    value={expression}
                    onChange={setExpression}
                    onMount={editor => (editorRef.current = editor)}
                    className="h-full"
                    minimap={false}
                    stickyScroll={false}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-zinc-50/80 p-3 rounded-lg border border-zinc-200 mt-2 shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManualTest}
                    disabled={isTesting || !expression}
                    className="h-8 gap-2 bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100 shadow-sm"
                  >
                    {isTesting ? (
                      <div className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Play className="w-3 h-3 fill-current text-zinc-400" />
                    )}
                    {tAnalysis('smart_metric.quick_test')}
                  </Button>

                  {testResult !== null && (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-2.5 py-1 rounded border border-green-100 animate-in fade-in">
                      <Check className="w-3.5 h-3.5" />
                      <span className="font-mono font-bold tracking-tight">
                        {testResult}
                      </span>
                      <span className="text-[10px] uppercase font-bold opacity-50 px-1 border-l border-green-200">
                        {type}
                      </span>
                    </div>
                  )}

                  {testError && (
                    <div
                      className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded border border-red-100 max-w-lg shadow-sm"
                      title={testError}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate font-medium">{testError}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="w-72 border-l border-zinc-200 bg-zinc-50/50 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-100/50 flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                {tAnalysis('smart_metric.available_fields')}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-6">
              {columnGroups.map((group, groupIdx) => (
                <div key={groupIdx} className="space-y-2">
                  <div className="flex items-center gap-1.5 px-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    <group.icon className="w-3 h-3" />
                    {group.title}
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {group.columns.map(col => (
                      <button
                        key={col.name}
                        onClick={() => insertAtCursor(col.name)}
                        className="group flex items-center justify-between w-full text-left px-2 py-1.5 rounded-md hover:bg-white hover:shadow-sm border border-transparent hover:border-zinc-200 transition-all text-xs"
                      >
                        <span
                          className="font-mono text-zinc-600 truncate mr-2"
                          title={col.name}
                        >
                          {col.name}
                        </span>
                        <span className="text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity font-bold">
                          {col.type}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-zinc-200 bg-white shrink-0">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isTesting}
            className="text-zinc-500"
          >
            {tAnalysis('smart_metric.cancel')}
          </Button>

          <Button
            onClick={validateAndSave}
            disabled={!name || !expression || isTesting}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2 min-w-[140px] shadow-md shadow-purple-100"
          >
            {isTesting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {tAnalysis('smart_metric.validating')}
              </>
            ) : (
              <>
                <Calculator className="w-4 h-4" />
                {tAnalysis('smart_metric.save')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

