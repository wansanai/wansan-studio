import React, { useRef, useEffect } from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import { formatForDisplay } from '@shared/serialization'
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { Button } from '../../ui/button'

interface ReportTableProps {
  data: Array<Record<string, unknown>>
  columnFields?: Array<{ name: string; type: string }>
  columns?: string[] // Legacy support
  columnTypes?: Record<string, string> // Legacy support
  variant: 'chat' | 'dashboard' | 'preview' | 'fullscreen' | 'report'
  highlightedItems?: string[]
}

const isNumericType = (type: string = '') => {
  const t = type.toUpperCase()
  return ['INT', 'BIGINT', 'DOUBLE', 'DECIMAL', 'FLOAT', 'NUMBER', 'REAL', 'INTEGER'].some(k =>
    t.includes(k)
  )
}

export function DataTable({
  data,
  columnFields = [],
  columns = [],
  columnTypes = {},
  variant = 'chat',
  highlightedItems = [],
}: ReportTableProps) {
  const { t } = useTranslation('common')
  const safeData = React.useMemo(() => data || [], [data])

  // Runtime compatibility: Reconstruct columnFields if missing
  const effectiveColumnFields = React.useMemo(() => {
    let fields: Array<{ name: string; type: string }> = []
    
    if (columnFields && columnFields.length > 0) {
      fields = columnFields
    } else if (columns && columns.length > 0) {
      fields = columns.map(name => ({
        name,
        type: columnTypes[name] || 'VARCHAR',
      }))
    } else if (safeData.length > 0) {
      // Final fallback: use keys from data and infer type
      const sample = safeData[0]
      fields = Object.keys(sample).map(name => ({
        name,
        type: typeof sample[name] === 'number' ? 'DOUBLE' : 'VARCHAR',
      }))
    }

    // [V1.7] Always hide internal system ID
    return fields.filter(f => f.name !== '_ws_row_id')
  }, [columnFields, columns, columnTypes, safeData])

  const [sorting, setSorting] = React.useState<SortingState>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const isCard = variant === 'chat' || variant === 'dashboard' || variant === 'report'
  const isModal = variant === 'preview' || variant === 'fullscreen'

  // Mouse drag scrolling
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    let isDown = false
    let startX = 0
    let scrollLeft = 0

    const handleMouseDown = (e: MouseEvent) => {
      // Only activate on table body, not on header buttons
      const target = e.target as HTMLElement
      if (target.closest('th')) return
      
      isDown = true
      container.style.cursor = 'grabbing'
      container.style.userSelect = 'none'
      startX = e.pageX - container.offsetLeft
      scrollLeft = container.scrollLeft
    }

    const handleMouseLeave = () => {
      isDown = false
      container.style.cursor = 'default'
      container.style.userSelect = 'auto'
    }

    const handleMouseUp = () => {
      isDown = false
      container.style.cursor = 'default'
      container.style.userSelect = 'auto'
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return
      e.preventDefault()
      const x = e.pageX - container.offsetLeft
      const walk = (x - startX) * 1.5 // Scroll speed multiplier
      container.scrollLeft = scrollLeft - walk
    }

    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('mouseleave', handleMouseLeave)
    container.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('mousemove', handleMouseMove)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('mouseleave', handleMouseLeave)
      container.removeEventListener('mouseup', handleMouseUp)
      container.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  const columnDefs: ColumnDef<Record<string, unknown>>[] =
    effectiveColumnFields.map(field => ({
      accessorKey: field.name,
      header: field.name,
      meta: {
        isNumeric: isNumericType(field.type),
      },
      cell: info => {
        const value = info.getValue()
        const display = formatForDisplay(value, field.type)
        return (
          <span className="truncate block min-w-[80px]" title={display}>
            {display}
          </span>
        )
      },
    }))

  const table = useReactTable({
    data: safeData,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  })

  const rowModel = table.getRowModel()

  return (
    <div className={cn(
      'flex flex-col w-full max-w-full min-w-0 transition-all',
      (variant === 'dashboard' || isModal) ? 'h-full' : 'h-auto'
    )}>
      <div
        ref={scrollContainerRef}
        style={{
          // Force scrollbar to always show on macOS
          scrollbarWidth: 'auto', // Reset to auto for better visibility
          scrollbarColor: '#d4d4d8 #f4f4f5', // Higher contrast for Firefox
        }}
        className={cn(
          'relative w-full scroll-smooth group/scroll',
          (variant === 'dashboard' || isModal) ? 'flex-1 overflow-auto' : 'overflow-x-auto overflow-y-auto max-h-[400px]',
          isCard
            ? 'border-0 bg-transparent'
            : 'border border-zinc-100 bg-white shadow-sm',
          // Webkit scrollbar styling - Forced visibility
          '[&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5',
          '[&::-webkit-scrollbar]:block', // Ensure it occupies space
          '[&::-webkit-scrollbar-track]:bg-zinc-50/50 [&::-webkit-scrollbar-track]:rounded-full',
          '[&::-webkit-scrollbar-thumb]:bg-zinc-300 [&::-webkit-scrollbar-thumb]:rounded-full',
          '[&::-webkit-scrollbar-thumb]:hover:bg-zinc-400',
          '[&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-clip-padding',
          '[&::-webkit-scrollbar-corner]:bg-transparent'
        )}
      >
        <table className="w-full text-sm border-separate border-spacing-0">
          <colgroup>
            {effectiveColumnFields.map((field, i) => (
              <col key={i} className={cn(
                isNumericType(field.type) ? "min-w-[100px]" : "min-w-[140px]"
              )} />
            ))}
          </colgroup>
          <thead
            className={cn(
              'sticky top-0 z-20',
              isCard ? 'bg-white/90 backdrop-blur-md' : 'bg-white/95 backdrop-blur-sm'
            )}
          >
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const sorted = header.column.getIsSorted()
                  const isNumeric = (header.column.columnDef.meta as { isNumeric?: boolean } | undefined)?.isNumeric
                  
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'h-10 px-4 transition-colors select-none group/th relative border-b border-zinc-100/80',
                        'border-r border-zinc-100/30 last:border-r-0', // Column distinction
                        'text-xs font-medium text-zinc-500 tracking-wider',
                        isNumeric ? 'text-right' : 'text-left',
                        header.column.getCanSort()
                          ? 'cursor-pointer hover:bg-zinc-50/80 hover:text-zinc-700'
                          : '',
                        sorted && 'text-indigo-600 font-semibold'
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className={cn(
                        "flex items-center gap-1.5 py-1",
                        isNumeric ? "justify-end" : "justify-start"
                      )}>
                        <span className="truncate">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </span>

                        {header.column.getCanSort() && (
                          <div className={cn(
                            "flex items-center justify-center transition-all duration-200 scale-110",
                            sorted 
                              ? "opacity-100" 
                              : "opacity-0 group-hover/th:opacity-100"
                          )}>
                            {sorted === 'asc' && <ArrowUp className="w-3 h-3 text-indigo-600 stroke-[2.5px]" />}
                            {sorted === 'desc' && <ArrowDown className="w-3 h-3 text-indigo-600 stroke-[2.5px]" />}
                            {!sorted && <ArrowUpDown className="w-3 h-3 text-zinc-400 group-hover/th:text-zinc-500" />}
                          </div>
                        )}
                      </div>
                      
                      {/* Active Sort Indicator Line */}
                      {sorted && (
                        <div className="absolute bottom-0 left-0 w-full h-[1.5px] bg-indigo-500/50 animate-in fade-in zoom-in-x duration-300" />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="text-zinc-600/90 font-light">
            {rowModel.rows.length ? (
              rowModel.rows.map((row) => {
                const rowValues = Object.values(row.original).map(v => String(v))
                const isHighlighted = highlightedItems.some(item => rowValues.includes(item))
                // Only dim if we have highlighting active and this row is NOT highlighted
                const isDimmed = highlightedItems.length > 0 && !isHighlighted

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'group transition-colors duration-200 ease-out border-b border-zinc-50 last:border-0',
                      isHighlighted 
                        ? 'bg-indigo-50/60' 
                        : 'bg-white hover:bg-zinc-50/60',
                      isDimmed && 'opacity-30 blur-[0.5px] grayscale'
                    )}
                  >
                  {row.getVisibleCells().map(cell => {
                    const isNumeric = (cell.column.columnDef.meta as { isNumeric?: boolean } | undefined)?.isNumeric

                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-4 py-2.5 truncate max-w-[300px]',
                          'border-r border-zinc-50/80 last:border-r-0', // Column distinction
                          isNumeric 
                            ? 'text-right font-mono text-zinc-700 tabular-nums tracking-tight' 
                            : 'text-left'
                        )}
                        title={String(cell.getValue())}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    )
                  })}
                  </tr>
                )
              })
            ) : (
              <tr>
                <td
                  colSpan={effectiveColumnFields.length || 1}
                  className="px-4 py-16 text-center text-sm text-zinc-400 font-light italic"
                >
                  {t('no_data')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end gap-3 py-3 px-4 border-t border-zinc-100/50 bg-white/50 shrink-0">
          <span className="text-[11px] font-medium text-zinc-400">
            {t('page_of', {
              page: table.getState().pagination.pageIndex + 1,
              total: table.getPageCount(),
            })}
          </span>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-zinc-100 rounded-lg text-zinc-500"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-zinc-100 rounded-lg text-zinc-500"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
