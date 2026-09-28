/**
 * DataPreviewPanel - Data Preview Container
 * Based on: docs/SPEC_DATA_EXPLORER_V2.md
 * 
 * Key Features:
 * - High-performance virtual grid preview
 * - Proper loading/error states
 */
import { useMemo, memo } from 'react'
import { VirtualDataGrid } from '../data-workspace/virtual-data-grid'
import { useProjectStore } from '@/stores/useProjectStore'
import { useTranslation } from 'react-i18next'
import { Loader2, AlertCircle, CloudUpload } from 'lucide-react'
import { ColumnSchema } from '@shared/types'
import { getLogicalViewName } from '@shared/naming-utils'

// Memoized Grid wrapper to prevent unnecessary remounts
const MemoizedGrid = memo(function MemoizedGrid({
  fileId,
  tableName,
  columns,
  totalRows,
  onModifyStructure,
  onRunAIExtract,
}: {
  fileId: string
  tableName: string
  columns: Array<ColumnSchema>
  totalRows?: number
  onModifyStructure?: () => void
  onRunAIExtract?: (columnName: string) => void
}) {
  // [V2.1] Always prefer the Enriched View (v_ prefix) to show AI fields, Metrics and Relations
  const targetTable = getLogicalViewName(tableName)
  
  return (
    <VirtualDataGrid
      fileId={fileId}
      tableName={targetTable}
      columns={columns}
      totalRows={totalRows}
      onModifyStructure={onModifyStructure}
      onRunAIExtract={onRunAIExtract}
    />
  )
})

export function DataPreviewPanel({
  onModifyStructure,
  onRunAIExtract,
}: {
  onModifyStructure?: () => void
  onRunAIExtract?: (columnName: string) => void
}) {
  const { activeFileId, files, isRestoring } = useProjectStore()
  const file = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId])
  const { t } = useTranslation('common')

  // [V2.1] Use viewSchema if available, otherwise fallback to physical columns
  const displayColumns = useMemo(() => {
    if (!file) return []
    return (file.viewSchema && file.viewSchema.length > 0) 
      ? file.viewSchema 
      : file.columns
  }, [file])

  // Show restoring state
  if (isRestoring) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-zinc-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">
          {t('restoring_session', { ns: 'chat' })}...
        </span>
      </div>
    )
  }

  // No file selected
  if (!file) {
    return (
      <div className="h-full w-full flex items-center justify-center text-zinc-400 text-sm">
        {t('select_table')}
      </div>
    )
  }

  // Uploading state
  if (file.status === 'uploading') {
    return (
      <div className="h-full w-full bg-zinc-50/30 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
        <div className="p-4 bg-indigo-50 rounded-full">
          <CloudUpload className="w-8 h-8 text-indigo-500 animate-bounce" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-semibold text-zinc-900">
            {t('sidebar.uploading')}
          </span>
          <span className="text-xs text-zinc-400 font-mono">{file.name}</span>
        </div>
      </div>
    )
  }

  // Processing state
  if (file.status === 'processing') {
    return (
      <div className="h-full w-full bg-zinc-50/30 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
        <div className="w-10 h-10 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-semibold text-zinc-900">
            {t('importing')}
          </span>
          <span className="text-xs text-zinc-400 font-mono italic">
            {file.name}
          </span>
        </div>
      </div>
    )
  }

  // Error state
  if (file.status === 'error') {
    return (
      <div className="h-full w-full bg-red-50/10 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
        <div className="p-4 bg-red-50 rounded-full mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-sm font-bold text-red-900 mb-2">
          {t('sidebar.import_failed_title')}
        </h3>
        <p className="text-xs text-red-600/80 max-w-xs mb-6 line-clamp-4 leading-relaxed font-mono">
          {file.error || t('import_failed')}
        </p>
        <div className="flex gap-3">
          <span className="text-[10px] text-zinc-400 italic">
            {t('sidebar.delete_and_retry')}
          </span>
        </div>
      </div>
    )
  }

  // Invalid metadata
  if (!file.tableName) {
    return (
      <div className="h-full w-full flex items-center justify-center text-red-400 text-sm">
        {t('invalid_metadata_table')}
      </div>
    )
  }

        return (
          <div className="h-full w-full bg-transparent flex flex-col overflow-hidden relative">
            <div className="flex-1 overflow-hidden relative">
              <MemoizedGrid
                key={file.id}
                fileId={file.id}
                tableName={file.tableName}
                columns={displayColumns}
                totalRows={file.rowCount}
                onModifyStructure={onModifyStructure}
                onRunAIExtract={onRunAIExtract}
              />
            </div>
          </div>
        )
  }

  