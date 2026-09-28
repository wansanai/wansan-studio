import React from 'react'
import {
  Type,
  Hash,
  Calendar,
  ToggleLeft,
  Sparkles,
  Link,
  ChevronRight,
} from 'lucide-react'
import { ColumnSchema } from '@shared/types'
import { FilterState } from '@shared/types/filter'
import { SortingState } from '@tanstack/react-table'
import { TableView } from '@shared/types/project'

export const PAGE_SIZE = 100
export const ROW_HEIGHT = 40
export const OVERSCAN = 5
export const REMOVE_MAPPING_VALUE = '__REMOVE__'

export function normalizeFilters(filters: TableView['filters']): FilterState {
  if (Array.isArray(filters)) {
    return { conjunction: 'AND', conditions: filters }
  }
  return filters || { conjunction: 'AND', conditions: [] }
}

export function normalizeVisibility(view: TableView | null): Record<string, boolean> {
  if (!view?.columnConfig?.hidden) return {}
  const visibility: Record<string, boolean> = {}
  view.columnConfig.hidden.forEach(col => {
    visibility[col] = false
  })
  return visibility
}

export function buildViewMeta(
  state: {
    filters: FilterState
    sorting: SortingState
    columnConfig: { hidden: string[]; order: string[] }
  },
  columns: ColumnSchema[]
) {
  return {
    updatedAt: Date.now(),
    filterCount: state.filters.conditions.filter(c => c.enabled).length,
    hiddenCount: state.columnConfig.hidden.length,
    sortCount: state.sorting.length,
    schemaHash: [...columns.map(c => c.name)].sort().join('|')
  }
}

export function getTypeIcon(type: string) {
  const t = type.toUpperCase()
  if (['INT', 'BIGINT', 'DOUBLE', 'DECIMAL', 'FLOAT', 'NUMBER', 'REAL', 'INTEGER'].some(k => t.includes(k))) return <Hash className="w-3 h-3" />
  if (['DATE', 'TIME', 'TIMESTAMP'].some(k => t.includes(k))) return <Calendar className="w-3 h-3" />
  if (['BOOLEAN'].includes(t)) return <ToggleLeft className="w-3 h-3" />
  return <Type className="w-3 h-3" />
}

export function getSourceIndicator(sourceType?: string) {
  switch (sourceType) {
    case 'ai':
      return { icon: <Sparkles className="w-3 h-3" />, color: 'text-purple-500', bg: 'bg-purple-50' }
    case 'metric':
      return { icon: <ChevronRight className="w-3 h-3" />, color: 'text-green-500', bg: 'bg-green-50' }
    case 'joined':
      return { icon: <Link className="w-3 h-3" />, color: 'text-orange-500', bg: 'bg-orange-50' }
    default:
      return null
  }
}
