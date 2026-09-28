import React from 'react'
import { Header } from '@tanstack/react-table'
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Edit3,
  EyeOff,
  Sparkles,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/utils/cn'
import { getTypeIcon, getSourceIndicator } from './utils'
import { ColumnSchema } from '@shared/types'

interface GridHeaderProps {
  header: Header<Record<string, unknown>, unknown>
  columns: ColumnSchema[]
  onModifyStructure?: () => void
  onHideColumn: (id: string) => void
  onRunAIExtract?: (id: string) => void
}

export function GridHeader({
  header,
  columns,
  onModifyStructure,
  onHideColumn,
  onRunAIExtract,
}: GridHeaderProps) {
  const isSorted = header.column.getIsSorted()
  const meta = header.column.columnDef.meta as { type?: string; sourceType?: string }
  const typeIcon = getTypeIcon(meta?.type || 'VARCHAR')
  const indicator = getSourceIndicator(meta?.sourceType)

  const originalColumn = columns.find(c => c.name === header.id)
  const alias = originalColumn?.semantic?.aliases?.[0]
  const displayName = alias ? `${alias} (${header.id})` : header.id

  return (
    <ContextMenu key={header.id}>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'h-10 px-2 py-2 flex items-center gap-2 text-[11px] font-medium text-zinc-500 relative cursor-pointer hover:bg-[#fbfbfa] dark:hover:bg-zinc-800 transition-all select-none whitespace-nowrap group/header',
            isSorted && 'text-indigo-600 bg-indigo-50/30 dark:bg-indigo-900/20'
          )}
          style={{ width: header.getSize(), flexShrink: 0 }}
          onClick={header.column.getToggleSortingHandler()}
        >
          {/* Subtle Vertical Divider */}
          <div className="absolute right-0 top-1/4 bottom-1/4 w-[1px] bg-zinc-200/50 group-last/header:hidden" />
          
          {/* Indicator Marker (Top) */}
          {indicator && (
            <div className={cn('absolute top-0 left-0 right-0 h-[2px] opacity-60', indicator.bg)} />
          )}

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-zinc-300 group-hover/header:text-indigo-400/70 transition-colors">{typeIcon}</span>
            <span className="truncate tracking-wide" title={displayName}>{displayName}</span>
            {indicator && (
              <span className={cn('flex items-center justify-center p-0.5 rounded-sm bg-white shadow-sm ring-1 ring-zinc-200/50', indicator.color)}>
                {indicator.icon}
              </span>
            )}
          </div>
          <div className="w-4 flex items-center justify-center">
            {isSorted ? (
              isSorted === 'asc' ? 
                <ArrowUp className="w-3 h-3 animate-in fade-in slide-in-from-bottom-1 duration-200" /> : 
                <ArrowDown className="w-3 h-3 animate-in fade-in slide-in-from-top-1 duration-200" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/header:opacity-30 transition-opacity" />
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          className="gap-2"
          onClick={onModifyStructure}
        >
          <Edit3 className="w-3.5 h-3.5" /> Modify Structure...
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 text-red-600 focus:text-red-600"
          onClick={() => onHideColumn(header.id)}
        >
          <EyeOff className="w-3.5 h-3.5" /> Hide Column
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem 
          className="gap-2 text-purple-600 focus:text-purple-600"
          onClick={() => onRunAIExtract?.(header.id)}
        >
          <Sparkles className="w-3.5 h-3.5" /> AI Extract...
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
