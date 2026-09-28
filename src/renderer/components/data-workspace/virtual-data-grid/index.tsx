import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2, RefreshCcw } from 'lucide-react'
import { formatForDisplay } from '@shared/serialization'
import { Button } from '@/components/ui/button'
import { RowDetailSheet } from '../row-detail-sheet'
import { FieldListSidebar } from '../field-list-sidebar'
import { useProjectStore } from '@/stores/useProjectStore'
import { ColumnSchema } from '@shared/types'
import { getVisibleColumns } from '@shared/utils/schema-utils'
import { FilterState } from '@shared/types/filter'

import { ROW_HEIGHT, OVERSCAN } from './utils'
import { useGridData } from './useGridData'
import { GridControlBar } from './GridControlBar'
import { GridRow } from './GridRow'
import { GridHeader } from './GridHeader'

interface VirtualDataGridProps {
  fileId: string
  tableName: string
  columns: Array<ColumnSchema>
  totalRows?: number
  onModifyStructure?: () => void
  onRunAIExtract?: (columnName: string) => void
}

export function VirtualDataGrid({
  fileId,
  tableName,
  columns,
  totalRows,
  onModifyStructure,
  onRunAIExtract,
}: VirtualDataGridProps): JSX.Element {
  const isGridDebug = import.meta.env.DEV
  const logGrid = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (!isGridDebug) return
    const ts = new Date().toISOString()
    if (payload) {
      console.debug(`[VirtualDataGrid][${ts}] ${event}`, payload)
      return
    }
    console.debug(`[VirtualDataGrid][${ts}] ${event}`)
  }, [isGridDebug])

  const parentRef = useRef<HTMLDivElement>(null)
  const { files, updateFile } = useProjectStore()
  const file = files.find(f => f.id === fileId)

  const [sorting, setSorting] = useState<SortingState>(file?.displayState?.sorting || [])
  const [filterState, setFilterState] = useState<FilterState>(file?.displayState?.filterState || { conjunction: 'AND', conditions: [] })
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(file?.displayState?.columnVisibility || {})
  const [columnOrder, setColumnOrder] = useState<string[]>(file?.displayState?.columnOrder || [])
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<Record<string, unknown> | null>(null)

  const availableColumns = useMemo(
    () => getVisibleColumns(columns),
    [columns]
  )

  useEffect(() => {
    if (availableColumns.length > 0 && columnOrder.length === 0) {
      setColumnOrder(availableColumns.map(c => c.name))
    }
  }, [availableColumns, columnOrder.length])

  const {
    flatData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch
  } = useGridData({
    tableName,
    sorting,
    filterState,
    lastModified: file?.lastModified,
  })

  const tableColumns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    return availableColumns.map(col => ({
      accessorKey: col.name,
      header: col.name,
      size: 150,
      meta: {
        type: col.type,
        sourceType: col.sourceType,
      },
      cell: info => formatForDisplay(info.getValue(), col.type)
    }))
  }, [availableColumns])

  const table = useReactTable({
    data: flatData,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    getRowId: (row) => String(row._ws_row_id ?? ''),
  })

  const { rows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: useCallback(() => parentRef.current, []),
    estimateSize: useCallback(() => ROW_HEIGHT, []),
    overscan: OVERSCAN,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  const hasNextPageRef = useRef(hasNextPage)
  const isFetchingNextPageRef = useRef(isFetchingNextPage)
  const fetchNextPageRef = useRef(fetchNextPage)

  useEffect(() => {
    hasNextPageRef.current = hasNextPage
    isFetchingNextPageRef.current = isFetchingNextPage
    fetchNextPageRef.current = fetchNextPage
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    logGrid('mounted', { fileId, tableName })
    return () => {
      logGrid('unmounted', { fileId, tableName })
    }
  }, [fileId, tableName, logGrid])

  // Throttled state change logging — only react to meaningful user-driven changes
  // (sorting / filter changes), not every data fetch cycle
  useEffect(() => {
    logGrid('state.changed', {
      sortingCount: sorting.length,
      filterCount: filterState.conditions.length,
    })
  }, [
    sorting.length,
    filterState.conditions.length,
    logGrid,
  ])

  // [v1.7.5] Auto-persist UI state to ProjectStore (which eventually saves to wansan.json)
  useEffect(() => {
    if (!fileId) return
    updateFile(fileId, {
      displayState: {
        filterState,
        sorting,
        columnVisibility,
        columnOrder,
      }
    })
  }, [fileId, filterState, sorting, columnVisibility, columnOrder, updateFile])

  useEffect(() => {
    const container = parentRef.current
    if (!container) return

    let ticking = false
    const maybeLoadMore = () => {
      if (!hasNextPageRef.current || isFetchingNextPageRef.current) return
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      if (distanceToBottom <= 240) {
        logGrid('load_more.trigger', {
          distanceToBottom,
          scrollTop: container.scrollTop,
          clientHeight: container.clientHeight,
          scrollHeight: container.scrollHeight,
        })
        void fetchNextPageRef.current()
      }
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        ticking = false
        maybeLoadMore()
      })
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    maybeLoadMore()

    return () => {
      container.removeEventListener('scroll', onScroll)
    }
  }, [logGrid])

  // Re-check load-more after data changes (e.g. viewport still not filled after a page loads)
  useEffect(() => {
    const container = parentRef.current
    if (!container) return
    if (!hasNextPageRef.current || isFetchingNextPageRef.current) return
    // Use rAF to wait for layout to settle after new rows render
    const id = requestAnimationFrame(() => {
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      if (distanceToBottom <= 240) {
        void fetchNextPageRef.current()
      }
    })
    return () => cancelAnimationFrame(id)
  }, [flatData.length])

  // Keep a ref to flatData so row callbacks stay stable across re-renders
  const flatDataRef = useRef(flatData)
  useEffect(() => {
    flatDataRef.current = flatData
  }, [flatData])

  const handleRowSelect = useCallback((rowId: string) => {
    logGrid('row.click', { rowId })
    setSelectedRowId(rowId)
  }, [logGrid])

  const handleRowOpen = useCallback((rowId: string) => {
    logGrid('row.double_click', { rowId })
    setSelectedRowId(rowId)
    const rowData = flatDataRef.current.find(r => String(r._ws_row_id) === rowId)
    if (rowData) {
      setDetailRow(rowData)
      setIsDetailOpen(true)
    }
  }, [logGrid])

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!selectedRowId || flatData.length === 0) return
    const idx = flatData.findIndex((r) => String(r._ws_row_id) === selectedRowId)
    if (idx === -1) return
    const newIdx = direction === 'next' ? idx + 1 : idx - 1
    if (newIdx >= 0 && newIdx < flatData.length) {
      const nextRow = flatData[newIdx]
      setSelectedRowId(String(nextRow._ws_row_id))
      setDetailRow(nextRow)
    } else if (direction === 'next' && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [selectedRowId, flatData, hasNextPage, isFetchingNextPage, fetchNextPage])

  const navState = useMemo(() => {
    const idx = flatData.findIndex((r) => String(r._ws_row_id) === selectedRowId)
    return {
      hasPrev: idx > 0,
      hasNext: idx < flatData.length - 1 || !!hasNextPage
    }
  }, [flatData, selectedRowId, hasNextPage])

  const handleHideColumn = (colName: string) => {
    setColumnVisibility(prev => ({ ...prev, [colName]: false }))
  }

  if (isLoading && !isError) return (
    <div className="h-full flex flex-col items-center justify-center bg-[#fbfbfa] dark:bg-zinc-950 backdrop-blur-xl gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-zinc-100 dark:border-zinc-800 animate-ping absolute inset-0" />
        <div className="w-12 h-12 rounded-full border-t-2 border-indigo-500 animate-spin relative" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-zinc-600 dark:text-zinc-400 font-medium text-sm">Preparing Data Workspace</span>
        <span className="text-zinc-400 dark:text-zinc-500 text-xs animate-pulse">Initializing virtual grid...</span>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col w-full bg-[#fbfbfa] dark:bg-zinc-950 relative">
      <RowDetailSheet open={isDetailOpen} onOpenChange={setIsDetailOpen} row={detailRow} columns={columns} onNavigate={handleNavigate} hasPrev={navState.hasPrev} hasNext={navState.hasNext} />

      <GridControlBar
        // Data & Filter Props
        tableName={tableName}
        columns={columns}
        filterState={filterState}
        setFilterState={setFilterState}
        availableColumns={availableColumns}
        
        // Toolbar Props
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
      />

      {isError && (
        <div className="px-3 py-2 border-b border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
          <span>{error?.message || 'Unknown error'}</span>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => refetch()}>
            <RefreshCcw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0">
          <div
            ref={parentRef}
            className="flex-1 overflow-auto w-full custom-scrollbar"
          >
            <div className="min-w-max min-h-full flex flex-col">
              <div className="sticky top-0 z-20 flex bg-[#fbfbfa]/90 dark:bg-zinc-900/90 backdrop-blur-md shadow-sm border-b border-zinc-100 dark:border-zinc-800">
                {table.getHeaderGroups().map(headerGroup => (
                  <div key={headerGroup.id} className="flex">
                    {headerGroup.headers.map(header => (
                      <GridHeader 
                        key={header.id}
                        header={header}
                        columns={columns}
                        onModifyStructure={onModifyStructure}
                        onHideColumn={handleHideColumn}
                        onRunAIExtract={onRunAIExtract}
                      />
                    ))}
                  </div>
                ))}
              </div>

              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }} className="bg-white dark:bg-zinc-950">
                {virtualItems.map((virtualRow) => {
                  const row = rows[virtualRow.index]
                  if (!row) return null
                  return (
                    <div
                      key={row.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                    >
                      <GridRow
                        row={row}
                        rowId={row.id}
                        isSelected={row.id === selectedRowId}
                        onSelect={handleRowSelect}
                        onOpen={handleRowOpen}
                      />
                    </div>
                  )
                })}
              </div>

              <div className="h-12 flex items-center justify-center">
                {isFetchingNextPage && <div className="flex items-center gap-2 text-zinc-400 text-xs"><Loader2 className="w-3 h-3 animate-spin" /> Loading more...</div>}
              </div>
            </div>
          </div>
        </div>

        {isSidebarOpen && file && (
          <FieldListSidebar
            file={file}
            columnVisibility={columnVisibility}
            onVisibilityChange={setColumnVisibility}
            columnOrder={columnOrder}
            onOrderChange={setColumnOrder}
            onClose={() => setIsSidebarOpen(false)}
          />
        )}
      </div>

      <div className="h-9 border-t border-zinc-100 bg-white/50 backdrop-blur-sm flex items-center px-2 justify-between text-[10px] text-zinc-400 font-medium tracking-tight flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="bg-zinc-100 px-2 py-0.5 rounded-full text-zinc-500 font-bold">{flatData.length}</span>
          <span>Rows loaded{totalRows ? ` / ~${totalRows.toLocaleString()} total` : ''}{!hasNextPage && flatData.length > 0 && ' (all loaded)'}</span>
        </div>
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-indigo-500 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Streaming data...</span>
          </div>
        )}
      </div>
    </div>
  )
}
