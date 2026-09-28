import React, { useCallback } from 'react'
import { X, Plus, LayoutPanelTop } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FilterState, OPERATOR_CONFIG } from '@shared/types/filter'
import { ColumnSchema } from '@shared/types'
import { cn } from '@/utils/cn'
import { FilterManager } from '../filter-manager'

interface GridControlBarProps {
  // Data & Filter Props
  tableName: string
  columns: ColumnSchema[]
  filterState: FilterState
  setFilterState: (f: FilterState | ((prev: FilterState) => FilterState)) => void
  availableColumns: ColumnSchema[]
  
  // Toolbar Props
  isSidebarOpen: boolean
  setIsSidebarOpen: (o: boolean) => void
}

export function GridControlBar({
  tableName,
  columns,
  filterState,
  setFilterState,
  availableColumns,
  isSidebarOpen,
  setIsSidebarOpen,
}: GridControlBarProps): JSX.Element {
  const handleRemoveChip = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFilterState(prev => ({
      ...prev,
      conditions: prev.conditions.filter(c => c.id !== id),
    }))
  }, [setFilterState])

  const handleToggleChip = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFilterState(prev => ({
      ...prev,
      conditions: prev.conditions.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c),
    }))
  }, [setFilterState])

  const handleClearFilters = useCallback(() => {
    setFilterState({ conjunction: 'AND', conditions: [] })
  }, [setFilterState])

  const allConditions = filterState.conditions

  const filterTrigger = (
    <Button 
      variant="ghost" 
      size="sm" 
      className="h-7 text-[10px] gap-1.5 px-2 rounded-full border border-dashed border-zinc-200 hover:border-indigo-300 hover:text-indigo-600 transition-all"
    >
      <Plus className="w-3.5 h-3.5" />
      Add Filter
    </Button>
  )

  return (
    <div className="px-2 py-2 border-b border-zinc-100/60 bg-white/40 backdrop-blur-md flex items-center justify-between min-h-[48px] gap-4">
      {/* Left Section: Context & Filters */}
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        <div className="flex items-center gap-2 mr-1 flex-shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 select-none">Filters</span>
        </div>

        <div className="w-px h-4 bg-zinc-200 mx-0.5 flex-shrink-0" />

        <div className="flex flex-wrap items-center gap-2">
          {allConditions.map(c => {
            const col = availableColumns.find(x => x.name === c.columnName)
            const label = col?.semantic?.aliases?.[0] || c.columnName
            const opLabel = OPERATOR_CONFIG[c.operator].symbol || OPERATOR_CONFIG[c.operator].label
            
            const chipTrigger = (
              <div
                key={c.id}
                className={cn(
                  'text-[11px] h-7 px-2.5 rounded-full border flex items-center gap-2 cursor-pointer transition-all hover:shadow-sm group/chip',
                  c.enabled 
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100/50' 
                    : 'border-zinc-200 bg-white text-zinc-400 opacity-60 hover:opacity-100 hover:border-zinc-300'
                )}
              >
                <div 
                  className="flex items-center gap-1.5"
                  onClick={(e) => handleToggleChip(c.id, e)}
                  title={c.enabled ? 'Disable condition' : 'Enable condition'}
                >
                  <span className="font-medium">{label}</span>
                  <span className="text-[10px] opacity-60 font-bold uppercase tracking-tighter">{opLabel}</span>
                  <span className="font-normal truncate max-w-[120px]">
                    {c.operator.includes('null') ? '' : String(c.value)}
                  </span>
                </div>
                <button 
                  className="hover:text-red-500 opacity-0 group-hover/chip:opacity-100 transition-opacity ml-1" 
                  onClick={(e) => handleRemoveChip(c.id, e)}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )

            return (
              <FilterManager
                key={c.id}
                tableName={tableName}
                columns={columns}
                filterState={filterState}
                onChange={setFilterState}
                trigger={chipTrigger}
              />
            )
          })}

          <FilterManager
            tableName={tableName}
            columns={columns}
            filterState={filterState}
            onChange={setFilterState}
            trigger={filterTrigger}
          />

          {allConditions.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-[10px] text-zinc-400 hover:text-red-500 font-medium px-2" 
              onClick={handleClearFilters}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Right Section: Fields */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 text-[11px] gap-2 px-3 rounded-full transition-all font-medium', 
            isSidebarOpen ? 'bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-100' : 'text-zinc-500 hover:bg-zinc-100'
          )}
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          <LayoutPanelTop className="w-3.5 h-3.5" />
          Fields
        </Button>
      </div>
    </div>
  )
}



