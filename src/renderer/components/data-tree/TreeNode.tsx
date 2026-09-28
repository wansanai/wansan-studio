import { NodeApi } from 'react-arborist'
import { TreeNodeData } from './tree-utils'
import {
  FolderClosed,
  FolderOpen,
  FileSpreadsheet,
  FileJson,
  FileText,
  FileArchive,
  Link2,
  Type,
  Hash,
  Calendar,
  ToggleLeft,
  ChevronRight,
  ChevronDown,
  Database,
  AlertCircle,
  FileWarning,
  Loader2,
} from 'lucide-react'
import { MouseEvent } from 'react'
import { useProjectStore } from '../../stores/useProjectStore'
import { useTranslation } from 'react-i18next'

interface TreeNodeProps {
  node: NodeApi<TreeNodeData>
  style: React.CSSProperties
  dragHandle?: (el: HTMLDivElement | null) => void
}

export function TreeNode({ node, style, dragHandle }: TreeNodeProps) {
  const data = node.data
  const isSelected = node.isSelected
  const { files } = useProjectStore()
  const { t } = useTranslation('common')

  const file =
    data.type === 'file' && data.fileId
      ? files.find(f => f.id === data.fileId)
      : undefined
  const isProcessing = file?.status === 'processing'
  const progress = file?.progress

  // --- Icon Logic ---
  const getIcon = () => {
    if (isProcessing) {
      return <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
    }

    if (data.type === 'folder') {
      return node.isOpen ? (
        <FolderOpen className="w-4 h-4 text-zinc-400" />
      ) : (
        <FolderClosed className="w-4 h-4 text-zinc-400" />
      )
    }

    if (data.type === 'file') {
      return getFileIcon()
    }

    if (data.type === 'relation') {
      return <Link2 className="w-4 h-4 text-indigo-500" />
    }

    if (data.type === 'column') {
      const type = data.columnType?.toUpperCase() || 'VARCHAR'

      if (
        [
          'DOUBLE',
          'BIGINT',
          'INT',
          'INTEGER',
          'DECIMAL',
          'FLOAT',
          'HUGEINT',
          'TINYINT',
          'SMALLINT',
        ].some(t => type.includes(t))
      ) {
        return <Hash className="w-3.5 h-3.5 text-blue-600" />
      }

      if (['DATE', 'TIMESTAMP', 'TIME'].some(t => type.includes(t))) {
        return <Calendar className="w-3.5 h-3.5 text-emerald-600" />
      }

      if (['BOOLEAN', 'BOOL'].includes(type)) {
        return <ToggleLeft className="w-3.5 h-3.5 text-purple-600" />
      }

      // Default to Text/VARCHAR
      return <Type className="w-3.5 h-3.5 text-zinc-500" />
    }

    return <Database className="w-4 h-4 text-zinc-400" />
  }

  const getFileIcon = () => {
    if (data.sourceType === 'database') {
      return <Database className="w-4 h-4 text-pink-500" />
    }

    const format = data.format
    if (format === 'json') {
      return <FileJson className="w-4 h-4 text-orange-500" />
    }
    if (format === 'csv') {
      return <FileText className="w-4 h-4 text-blue-500" />
    }
    if (format === 'parquet') {
      return <FileArchive className="w-4 h-4 text-amber-600" />
    }
    if (format === 'excel') {
      return <FileSpreadsheet className="w-4 h-4 text-green-600" />
    }

    // Default Fallback
    return <FileSpreadsheet className="w-4 h-4 text-zinc-400" />
  }

  // --- Interaction ---
  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    node.select()
    // node.edit()
  }

  const handleToggle = (e: MouseEvent) => {
    e.stopPropagation()
    node.toggle()
  }

  // --- Styles ---
  const containerClass = `
    flex items-center w-full h-full cursor-pointer select-none text-sm pr-2 outline-none
    ${isSelected ? 'bg-zinc-100 text-zinc-900 border-l-2 border-zinc-900' : 'text-zinc-600 border-l-2 border-transparent hover:bg-zinc-50'}
  `
    .replace(/\s+/g, ' ')
    .trim()

  const isMissing = data.type === 'file' && data.status === 'missing'

  return (
    <div
      style={style}
      className={containerClass}
      onClick={handleClick}
      ref={dragHandle}
    >
      {/* Indentation / Arrow */}
      <div
        className="flex items-center justify-center w-6 shrink-0"
        onClick={handleToggle}
      >
        {!node.isLeaf &&
          (node.isOpen ? (
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-zinc-400" />
          ))}
      </div>

      {/* Icon */}
      <div className="flex items-center justify-center w-5 shrink-0 mr-1 relative">
        {isMissing ? (
          <FileWarning className="w-4 h-4 text-red-400" />
        ) : (
          getIcon()
        )}
        {!isMissing &&
          data.type === 'file' &&
          data.status === 'out-of-sync' && (
            <div className="absolute -top-1 -right-1 bg-white rounded-full">
              <AlertCircle className="w-2.5 h-2.5 text-amber-500 fill-white" />
            </div>
          )}
      </div>

      {/* Label */}
      <span
        className={`truncate flex-1 ${isMissing ? 'line-through text-red-400 opacity-80' : ''}`}
        title={isMissing ? t('file_missing_tooltip') : undefined}
      >
        {data.alias ? `${data.alias} (${data.name})` : data.name}
        {isProcessing && progress !== undefined && (
          <span className="text-xs text-indigo-500 ml-2 font-mono">
            {progress > 100
              ? `${progress.toLocaleString()} rows`
              : `${Math.round(progress)}%`}
          </span>
        )}
      </span>

      {/* Badges / Indicators */}
      {data.isKey && (
        <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded ml-1 border border-amber-200">
          PK
        </span>
      )}
      {data.isForeignKey && (
        <span className="ml-1" title={t('part_of_relationship')}>
          <Link2 className="w-3 h-3 text-indigo-400" />
        </span>
      )}
    </div>
  )
}
