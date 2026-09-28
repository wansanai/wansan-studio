import React, { useEffect } from 'react'
import { CheckCircle2, Circle, Trash2, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { 
  FilterCondition, 
  FilterValidationCode,
  OPERATOR_CONFIG, 
  FilterOperator, 
  getSimpleType,
} from '@shared/types/filter'
import { ColumnSchema } from '@shared/types'
import { cn } from '@/utils/cn'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ValueInput } from './ValueInput'
import { getEffectiveInputType } from './utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface FilterRowProps { 
  tableName: string
  condition: FilterCondition
  columns: ColumnSchema[]
  index: number
  conjunction: 'AND' | 'OR'
  onUpdate: (id: string, updates: Partial<FilterCondition>) => void
  onRemove: (id: string) => void
  validationCodes: FilterValidationCode[]
}

export function FilterRow({ 
  tableName,
  condition, 
  columns, 
  index, 
  conjunction,
  onUpdate, 
  onRemove,
  validationCodes
}: FilterRowProps) {
  const { t } = useTranslation('common')
  const simpleType = getSimpleType(condition.columnType)
  
  const availableOps = React.useMemo(() => 
    Object.entries(OPERATOR_CONFIG).filter(([_, conf]) => 
      conf.validTypes.includes(simpleType)
    ) as [FilterOperator, typeof OPERATOR_CONFIG['equals']][],
    [simpleType]
  )

  const activeColumns = React.useMemo(() => 
    columns.filter(c => c.name !== '_ws_row_id'),
    [columns]
  )

  const selectedColumn = activeColumns.find(c => c.name === condition.columnName)
  const safeColumnValue = selectedColumn ? condition.columnName : (activeColumns[0]?.name || '')
  const safeOperatorValue = availableOps.some(([op]) => op === condition.operator)
    ? condition.operator
    : (availableOps[0]?.[0] || 'equals')

  useEffect(() => {
    const hasColumn = activeColumns.some(c => c.name === condition.columnName)
    if (!hasColumn && activeColumns.length > 0) {
      const fallback = activeColumns[0]
      onUpdate(condition.id, { 
        columnName: fallback.name, 
        columnType: fallback.type, 
        sourceType: fallback.sourceType 
      })
      return
    }

    const isValidOperator = availableOps.some(([op]) => op === condition.operator)
    if (!isValidOperator && availableOps.length > 0) {
      onUpdate(condition.id, { operator: availableOps[0][0] })
    }
  }, [activeColumns, availableOps, condition.id, condition.columnName, condition.operator, onUpdate])

  const hasError = validationCodes.length > 0

  return (
    <div className="flex items-center gap-3 group animate-in fade-in slide-in-from-left-2 duration-200 relative">
      {/* Logical Connector Visual */}
      <div className="w-12 shrink-0 flex justify-end pr-2 text-[10px] font-black text-zinc-300 select-none tracking-tighter italic">
        {index === 0 ? 'WHERE' : conjunction}
      </div>

      <div className={cn(
        "flex-1 flex items-center gap-3 bg-white border border-zinc-100 rounded-2xl p-2 transition-all duration-300",
        !condition.enabled ? "opacity-40 bg-zinc-50/50" : "shadow-sm hover:border-indigo-200 hover:shadow-md",
        hasError && "border-red-200 bg-red-50/30 ring-1 ring-red-100"
      )}>
        {/* Column Select */}
        <Select 
          value={safeColumnValue} 
          onValueChange={(val) => {
            const col = activeColumns.find(c => c.name === val)
            if (col) {
              onUpdate(condition.id, { columnName: val, columnType: col.type, sourceType: col.sourceType })
            }
          }}
        >
          <SelectTrigger className="h-8 w-[160px] text-xs border-0 bg-zinc-100/50 focus:ring-0 focus:bg-zinc-100/80 transition-all rounded-xl overflow-hidden px-3">
            <div className="truncate text-left font-semibold text-zinc-700">
              {selectedColumn ? (selectedColumn.semantic?.aliases?.[0] || selectedColumn.name) : <SelectValue />}
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-[300px] rounded-2xl shadow-2xl border-zinc-200/50 p-1">
            {activeColumns.map(col => {
               const alias = col.semantic?.aliases?.[0]
               return (
                 <SelectItem key={col.name} value={col.name} className="rounded-xl transition-colors">
                   <div className="flex flex-col gap-0.5 text-xs py-1">
                     <span className="font-bold">{alias || col.name}</span>
                     {alias && <span className="text-[10px] text-zinc-400 font-medium">{col.name}</span>}
                   </div>
                 </SelectItem>
               )
            })}
          </SelectContent>
        </Select>

        {/* Operator Select */}
        <Select 
          value={safeOperatorValue} 
          onValueChange={(val: FilterOperator) => onUpdate(condition.id, { operator: val })}
        >
          <SelectTrigger className="h-8 w-[110px] text-[10px] border-0 bg-zinc-100/50 focus:ring-0 focus:bg-zinc-100/80 text-zinc-500 font-black transition-all rounded-xl uppercase tracking-widest px-3">
            <div className="truncate">
              {availableOps.find(([op]) => op === safeOperatorValue)?.[1].label || <SelectValue />}
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-2xl shadow-2xl border-zinc-200/50 p-1">
            {availableOps.map(([op, conf]) => (
              <SelectItem key={op} value={op} className="rounded-xl">
                <span className="text-[10px] font-black uppercase tracking-widest py-1">{conf.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Value Input */}
        <div className="flex-1 min-w-[120px]">
          <ValueInput
            tableName={tableName}
            columnName={condition.columnName}
            columnType={condition.columnType}
            operator={condition.operator}
            type={getEffectiveInputType(condition.operator, simpleType)}
            value={condition.value} 
            onChange={(val) => onUpdate(condition.id, { value: val })} 
          />
        </div>

        {/* Actions Section */}
        <div className="flex items-center gap-1 pl-2 border-l border-zinc-100 ml-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    condition.enabled ? "text-indigo-500 bg-indigo-50/50 hover:bg-indigo-100" : "text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100"
                  )}
                  onClick={() => onUpdate(condition.id, { enabled: !condition.enabled })}
                >
                  {condition.enabled ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-[10px] font-bold px-2 py-1 bg-zinc-900 text-white rounded-md border-0">
                {condition.enabled ? 'Disable' : 'Enable'}
              </TooltipContent>
            </Tooltip>

            {hasError && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center h-8 w-8 text-red-500 animate-pulse cursor-help">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-[10px] font-bold bg-red-600 text-white p-2 rounded-lg border-0 shadow-xl max-w-[200px]">
                  {validationCodes.map(code => (
                    <div key={code} className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-white shrink-0" />
                      {code === 'value_required' && t('filter_value_required', 'Value is required')}
                      {code === 'range_required' && t('filter_range_required', 'Both min and max are required')}
                      {code === 'range_invalid' && t('filter_range_invalid', 'Range is invalid (min <= max)')}
                      {code === 'list_required' && t('filter_list_required', 'At least one list item is required')}
                    </div>
                  ))}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                  onClick={() => onRemove(condition.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-[10px] font-bold px-2 py-1 bg-zinc-900 text-white rounded-md border-0">
                Remove
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}
