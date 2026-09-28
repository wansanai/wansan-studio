import React, { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import {
  ListFilter,
  Plus,
  Trash2,
  X,
  Check,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { 
  FilterCondition, 
  FilterState, 
  FilterValidationCode,
  getSimpleType,
  validateFilterState,
} from '@shared/types/filter'
import { ColumnSchema } from '@shared/types'
import { cn } from '@/utils/cn'
import { v4 as uuidv4 } from 'uuid'
import { FilterRow } from './FilterRow'
import { getEffectiveInputType } from './utils'

interface FilterManagerProps {
  tableName: string
  columns: ColumnSchema[]
  filterState: FilterState
  onChange: (state: FilterState) => void
  errorMessage?: string | null
  trigger?: React.ReactNode
}

export function FilterManager({ tableName, columns, filterState, onChange, errorMessage, trigger }: FilterManagerProps) {
  const { t } = useTranslation('common')
  const [isOpen, setIsOpen] = useState(false)
  const [validationMap, setValidationMap] = useState<Record<string, FilterValidationCode[]>>({})

  // Draft state: edits happen here without triggering parent re-renders
  const [draftState, setDraftState] = useState<FilterState>(filterState)

  // When popover opens, sync draft with current state
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setDraftState(filterState)
    }
    setIsOpen(open)
  }

  const handleApply = () => {
    const issues = validateFilterState(draftState)
    if (issues.length > 0) {
      const nextMap: Record<string, FilterValidationCode[]> = {}
      issues.forEach(issue => {
        if (!nextMap[issue.conditionId]) nextMap[issue.conditionId] = []
        nextMap[issue.conditionId].push(issue.code)
      })
      setValidationMap(nextMap)
      return
    }

    setValidationMap({})
    onChange(draftState)
    setIsOpen(false)
  }

  const handleCancel = () => {
    setValidationMap({})
    setIsOpen(false)
  }

  const handleAddCondition = React.useCallback(() => {
    const defaultCol = columns.find(c => c.name !== '_ws_row_id') || columns[0]
    if (!defaultCol) return

    const newCondition: FilterCondition = {
      id: uuidv4(),
      columnName: defaultCol.name,
      columnType: defaultCol.type,
      sourceType: defaultCol.sourceType,
      operator: 'equals',
      value: '',
      enabled: true
    }

    setDraftState(prev => ({
      ...prev,
      conditions: [...prev.conditions, newCondition]
    }))
  }, [columns])

  const handleUpdateCondition = React.useCallback((id: string, updates: Partial<FilterCondition>) => {
    setDraftState(prev => ({
      ...prev,
      conditions: prev.conditions.map(c => {
        if (c.id !== id) return c
        
        const oldSimpleType = getSimpleType(c.columnType)
        const oldInputType = getEffectiveInputType(c.operator, oldSimpleType)
        
        const newCond = { ...c, ...updates }
        const newSimpleType = getSimpleType(newCond.columnType)
        const newInputType = getEffectiveInputType(newCond.operator, newSimpleType)

        // --- 1. Reset logic on Type/Operator change ---
        const isColumnChange = !!(updates.columnName && updates.columnName !== c.columnName)
        const isOperatorChange = !!(updates.operator && updates.operator !== c.operator)

        if (isColumnChange || isOperatorChange) {
          // If input type category changed significantly, reset value
          const isCompatible = !isColumnChange && (
            (oldInputType === 'text' && newInputType === 'multi') ||
            (oldInputType === 'multi' && newInputType === 'text') ||
            (oldInputType === newInputType)
          )

          if (!isCompatible) {
            if (newInputType === 'range' || newInputType === 'date_range') {
              newCond.value = ['', '']
            } else if (newInputType === 'multi') {
              newCond.value = []
            } else if (newSimpleType === 'boolean') {
              newCond.value = true
            } else if (newInputType === 'none') {
              newCond.value = ''
            } else {
              newCond.value = ''
            }
          }
        }

        // --- 2. Type Coercion Logic (Refinement) ---
        if (newInputType === 'number' && newCond.value !== '') {
          const num = Number(newCond.value)
          if (!isNaN(num)) newCond.value = num
        } else if (newInputType === 'multi' && typeof newCond.value === 'string') {
          newCond.value = newCond.value.split(',').map(s => s.trim()).filter(Boolean)
        }
        
        return newCond
      })
    }))
    setValidationMap(prev => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const handleRemoveCondition = React.useCallback((id: string) => {
    setDraftState(prev => ({
      ...prev,
      conditions: prev.conditions.filter(c => c.id !== id)
    }))
    setValidationMap(prev => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const toggleConjunction = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraftState(prev => ({
      ...prev,
      conjunction: prev.conjunction === 'AND' ? 'OR' : 'AND'
    }))
  }

  const activeCount = filterState.conditions.filter(c => c.enabled).length
  const totalCount = filterState.conditions.length

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button 
            variant={activeCount > 0 ? "secondary" : "ghost"} 
            size="sm" 
            className={cn(
              "h-8 text-xs gap-2 px-3 transition-all rounded-full border-transparent",
              activeCount > 0 
                ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200 shadow-sm" 
                : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
            )}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>{t('filter')}</span>
            {totalCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/80 border border-zinc-200">
                {activeCount}/{totalCount}
              </span>
            )}
          </Button>
        )}
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-[860px] max-w-[95vw] p-0 shadow-2xl border-zinc-200/50 pointer-events-auto" 
        align="start"
        onInteractOutside={(e) => {
          e.preventDefault()
        }}
        onFocusOutside={(e) => {
          e.preventDefault()
        }}
      >
        {errorMessage && (
          <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">
            {errorMessage}
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/80 backdrop-blur-sm rounded-t-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-700">{t('filter_conditions')}</span>
            <div className="h-4 w-px bg-zinc-300 mx-1" />
            <span className="text-xs text-zinc-500">Match</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={toggleConjunction}
              className="h-6 text-[10px] font-bold px-2 uppercase tracking-wider bg-white border-zinc-200 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              {draftState.conjunction === 'AND' ? 'All (AND)' : 'Any (OR)'}
            </Button>
            <span className="text-xs text-zinc-500">of the following:</span>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 rounded-full hover:bg-zinc-200/50"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Condition List */}
        <div className="p-2 max-h-[400px] overflow-y-auto bg-zinc-50/30 custom-scrollbar space-y-2">
          {draftState.conditions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-400 gap-2">
              <ListFilter className="w-8 h-8 opacity-20" />
              <p className="text-xs">{t('no_filters_yet')}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={handleAddCondition}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                {t('add_filter')}
              </Button>
            </div>
          ) : (
            draftState.conditions.map((condition, index) => (
              <FilterRow 
                key={condition.id}
                tableName={tableName}
                condition={condition}
                columns={columns}
                index={index}
                conjunction={draftState.conjunction}
                onUpdate={handleUpdateCondition}
                onRemove={handleRemoveCondition}
                validationCodes={validationMap[condition.id] || []}
              />
            ))
          )}
        </div>

        {/* Footer Actions */}
        {draftState.conditions.length > 0 && (
          <div className="p-2 border-t border-zinc-100 bg-white rounded-b-lg flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs text-zinc-400 hover:text-red-500 h-8"
                onClick={() => setDraftState({ conjunction: 'AND', conditions: [] })}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                {t('clear_all')}
              </Button>
              <Button 
                variant="outline"
                size="sm" 
                className="h-8 text-xs gap-1.5 border-dashed border-zinc-200 hover:border-indigo-300 hover:text-indigo-600"
                onClick={handleAddCondition}
              >
                <Plus className="w-3.5 h-3.5" />
                {t('add_condition')}
              </Button>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <Button 
                variant="ghost"
                size="sm" 
                className="flex-1 h-9 text-xs text-zinc-500 hover:bg-zinc-100"
                onClick={handleCancel}
              >
                {t('cancel')}
              </Button>
              <Button 
                size="sm" 
                className="flex-1 h-9 text-xs bg-indigo-600 text-white hover:bg-indigo-700 shadow-md font-bold"
                onClick={handleApply}
              >
                <Check className="w-4 h-4 mr-2" />
                {t('apply_filters')}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
