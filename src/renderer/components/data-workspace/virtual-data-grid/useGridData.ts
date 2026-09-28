import { useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { SortingState } from '@tanstack/react-table'
import { FilterState, filterStateToSQL, validateFilterState } from '@shared/types/filter'
import { PAGE_SIZE } from './utils'

interface UseGridDataProps {
  tableName: string
  sorting: SortingState
  filterState: FilterState
  lastModified?: number
}

export function useGridData({ tableName, sorting, filterState, lastModified }: UseGridDataProps) {
  const queryFn = useCallback(async ({ pageParam = 0 }: { pageParam?: number }) => {
    const issues = validateFilterState(filterState)
    if (issues.length > 0) {
      throw new Error(`Filter validation failed: ${issues.map(i => i.code).join(', ')}`)
    }

    const whereClause = filterStateToSQL(filterState)

    let orderBy = ''
    if (sorting.length > 0) {
      const sort = sorting[0]
      orderBy = `ORDER BY "${sort.id}" ${sort.desc ? 'DESC' : 'ASC'}`
    } else {
      orderBy = 'ORDER BY _ws_row_id ASC'
    }

    const sql = `SELECT * FROM "${tableName}" ${whereClause} ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${pageParam}`
    const res = await window.electronAPI.runSQL(sql)
    if (!res.success) {
      throw new Error(res.error || 'SQL execution failed')
    }

    return (res.data?.data || []) as Record<string, unknown>[]
  }, [tableName, sorting, filterState])

  const query = useInfiniteQuery({
    queryKey: ['table-data', tableName, sorting, filterState, lastModified],
    queryFn,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined
      return allPages.length * PAGE_SIZE
    },
    refetchOnWindowFocus: false,
    staleTime: 30000,
    retry: false, // Don't retry on SQL errors to prevent loop noise
  })

  const flatData = query.data?.pages.flat() ?? []

  return {
    ...query,
    flatData,
  }
}
