import React, { memo, useCallback } from 'react'
import { flexRender, Row } from '@tanstack/react-table'
import { cn } from '@/utils/cn'
import { formatForDisplay } from '@shared/serialization'
import { ROW_HEIGHT, getSourceIndicator } from './utils'

interface GridRowProps {
  row: Row<Record<string, unknown>>
  rowId: string
  isSelected: boolean
  onSelect: (rowId: string) => void
  onOpen: (rowId: string) => void
}

export const GridRow = memo(function GridRow({
  row,
  rowId,
  isSelected,
  onSelect,
  onOpen,
}: GridRowProps) {
  const handleClick = useCallback(() => {
    onSelect(rowId)
  }, [onSelect, rowId])

  const handleDoubleClick = useCallback(() => {
    onOpen(rowId)
  }, [onOpen, rowId])

  return (
    <div
      className={cn(
        'flex items-center border-b border-zinc-100/60 hover:bg-zinc-50/50 cursor-pointer transition-all duration-200 group/row relative',
        isSelected && 'bg-indigo-50/30 hover:bg-indigo-50/40'
      )}
      style={{ height: ROW_HEIGHT }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Selection Accent */}
      {isSelected && (
        <div className="absolute left-0 top-[10%] bottom-[10%] w-[3px] bg-indigo-500 rounded-r-full z-10 animate-in fade-in zoom-in-y duration-300" />
      )}

      {row.getVisibleCells().map((cell) => {
        const sourceType = (cell.column.columnDef.meta as { sourceType?: string })?.sourceType
        const indicator = getSourceIndicator(sourceType)

        return (
          <div
            key={cell.id}
            className={cn(
              'px-2 py-2 text-[13px] text-zinc-600 truncate border-r border-zinc-50 last:border-r-0 font-normal tracking-tight h-full flex items-center transition-colors',
              indicator?.bg && 'bg-opacity-[0.03] text-zinc-700',
              indicator?.bg,
              isSelected && 'text-indigo-900 font-medium'
            )}
            style={{ width: cell.column.getSize(), flexShrink: 0 }}
          >
            <span className="truncate" title={String(formatForDisplay(cell.getValue(), (cell.column.columnDef.meta as { type?: string })?.type || 'VARCHAR'))}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </span>
          </div>
        )
      })}
    </div>
  )
})
