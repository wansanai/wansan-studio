import React, { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'
import { FilterOperator } from '@shared/types/filter'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { cn } from '@/utils/cn'

export type EffectiveInputType = 'text' | 'number' | 'date' | 'none' | 'multi' | 'range' | 'date_range'

interface ValueInputProps {
  tableName: string
  columnName: string
  columnType: string
  operator: FilterOperator
  type: EffectiveInputType
  value: unknown
  onChange: (val: unknown) => void
}

export function ValueInput({
  tableName,
  columnName,
  columnType,
  operator,
  type,
  value,
  onChange
}: ValueInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const shouldFetchSuggestions = (
    operator === 'equals' ||
    operator === 'not_equals' ||
    operator === 'in' ||
    operator === 'not_in'
  )

  useEffect(() => {
    let active = true
    if (!shouldFetchSuggestions || !tableName || !columnName) {
      setSuggestions([])
      return
    }

    const escapedTable = tableName.replace(/"/g, '""')
    const escapedColumn = columnName.replace(/"/g, '""')
    setLoadingSuggestions(true)
    window.electronAPI.runSQL(
      `SELECT DISTINCT "${escapedColumn}" AS v FROM "${escapedTable}" WHERE "${escapedColumn}" IS NOT NULL ORDER BY 1 LIMIT 50`
    ).then(res => {
      if (!active) return
      if (!res.success || !res.data) {
        setSuggestions([])
        return
      }
      const next = (res.data.data || [])
        .map((row: Record<string, unknown>) => row.v)
        .filter((v: unknown) => v !== null && v !== undefined)
        .map((v: unknown) => String(v))
      setSuggestions(next)
    }).catch(() => {
      if (!active) return
      setSuggestions([])
    }).finally(() => {
      if (active) setLoadingSuggestions(false)
    })

    return () => {
      active = false
    }
  }, [shouldFetchSuggestions, tableName, columnName, operator, columnType])

  const renderDatePicker = (val: string, onSet: (v: string) => void, placeholder: string = 'Select date') => {
    const date = val ? new Date(val) : undefined
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 flex-1 justify-start text-left font-medium text-[11px] px-3 border-0 bg-zinc-100/50 hover:bg-zinc-100 transition-all min-w-[110px] rounded-xl",
              !val && "text-zinc-400"
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="truncate">{date ? format(date, "yyyy-MM-dd") : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 rounded-2xl shadow-2xl border-zinc-200/50 z-[100]" align="start" sideOffset={8}>
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => onSet(d ? d.toISOString().split('T')[0] : '')}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    )
  }

  const renderSuggestionsInput = (isMulti: boolean) => {
    const currentValues = isMulti 
      ? (Array.isArray(value) ? value.map(v => String(v)) : String(value || '').split(',').map(v => v.trim()).filter(Boolean))
      : [String(value || '')]

    const filteredSuggestions = suggestions.filter(s => 
      s.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
      <Popover onOpenChange={(open) => !open && setSearchQuery('')}>
        <PopoverTrigger asChild>
          <div className="relative group/suggest flex-1 min-w-[120px]">
            <Input 
              className="h-8 text-xs border-0 bg-zinc-100/50 focus:bg-zinc-100 focus:ring-0 transition-all pr-10 rounded-xl w-full font-medium"
              placeholder={isMulti ? "Search or select..." : "Type or select..."}
              value={isMulti ? currentValues.join(', ') : (value as string || '')}
              onChange={(e) => onChange(e.target.value)}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none group-hover/suggest:text-indigo-500 transition-colors">
              {loadingSuggestions ? (
                <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              ) : isMulti ? (
                <span className="text-[10px] font-black bg-white px-1.5 py-0.5 rounded-md shadow-sm border border-zinc-100 text-zinc-500">{currentValues.length}</span>
              ) : (
                <ChevronDown className="w-3.5 h-3.5 opacity-40" />
              )}
            </div>
          </div>
        </PopoverTrigger>
        {suggestions.length > 0 && (
          <PopoverContent className="w-[260px] p-0 rounded-2xl shadow-2xl border-zinc-200/50 overflow-hidden z-[100]" align="start" sideOffset={8}>
            <div className="p-3 bg-zinc-50/50 border-b border-zinc-100">
              <Input
                autoFocus
                placeholder="Filter results..."
                className="h-8 text-xs bg-white border-zinc-200 rounded-xl px-3 shadow-inner"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="px-3 py-2 border-b border-zinc-50 flex items-center justify-between bg-white/80">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                {isMulti ? 'Select Multiple' : 'Select Value'}
              </span>
              <span className="text-[9px] text-zinc-300 font-bold">{isMulti ? 'Toggle items' : 'Single pick'}</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto custom-scrollbar p-1.5 bg-white">
              {filteredSuggestions.length === 0 ? (
                <div className="py-6 text-center text-[10px] text-zinc-400 font-bold tracking-tight uppercase">No results found</div>
              ) : (
                filteredSuggestions.map(s => {
                  const isSelected = isMulti ? currentValues.includes(s) : String(value) === s
                  return (
                    <div
                      key={s}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 text-xs rounded-xl cursor-pointer transition-all mb-0.5 last:mb-0",
                        isSelected 
                          ? "bg-indigo-50 text-indigo-700 font-bold" 
                          : "hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900"
                      )}
                      onClick={() => {
                        if (isMulti) {
                          const next = isSelected 
                            ? currentValues.filter(v => v !== s)
                            : [...currentValues, s]
                          onChange(next.join(', '))
                        } else {
                          onChange(s)
                        }
                      }}
                    >
                      <span className="truncate">{s}</span>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)] animate-in zoom-in duration-300" />}
                    </div>
                  )
                })
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>
    )
  }

  if (type === 'none') return null

  if (type === 'range' || type === 'date_range') {
    const minValue = Array.isArray(value) ? (value[0] as string | number | undefined) || '' : ''
    const maxValue = Array.isArray(value) ? (value[1] as string | number | undefined) || '' : ''

    return (
      <div className="flex items-center gap-2 w-full">
        {type === 'date_range' ? (
          <div className="flex items-center gap-2 flex-1">
            {renderDatePicker(String(minValue), (v) => onChange([v, maxValue]), 'Start')}
            <span className="text-[10px] font-black text-zinc-300 uppercase tracking-tighter shrink-0 italic">to</span>
            {renderDatePicker(String(maxValue), (v) => onChange([minValue, v]), 'End')}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <Input 
              type="text"
              className="h-8 text-xs border-0 bg-zinc-100/50 focus:bg-zinc-100 focus:ring-0 transition-all flex-1 min-w-[60px] rounded-xl px-3 font-medium"
              placeholder="Min"
              value={minValue}
              onChange={(e) => onChange([e.target.value, maxValue])}
            />
            <span className="text-[10px] font-black text-zinc-300 uppercase tracking-tighter shrink-0 italic">-</span>
            <Input 
              type="text"
              className="h-8 text-xs border-0 bg-zinc-100/50 focus:bg-zinc-100 focus:ring-0 transition-all flex-1 min-w-[60px] rounded-xl px-3 font-medium"
              placeholder="Max"
              value={maxValue}
              onChange={(e) => onChange([minValue, e.target.value])}
            />
          </div>
        )}
      </div>
    )
  }

  if (type === 'number') {
    return (
        <Input 
          type="number"
          className="h-8 text-xs border-0 bg-zinc-100/50 focus:bg-zinc-100 focus:ring-0 transition-all rounded-xl px-3 font-medium"
          placeholder="0"
          value={typeof value === 'number' || typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }

  if (type === 'date') {
    return renderDatePicker(typeof value === 'string' ? value : '', (v) => onChange(v))
  }

  if (type === 'multi') {
    return renderSuggestionsInput(true)
  }

  // Boolean Toggle
  if (typeof value === 'boolean' || value === 'true' || value === 'false') {
    const isTrue = value === true || value === 'true'
    return (
      <div className="flex items-center gap-3 px-2 bg-zinc-100/50 h-8 rounded-xl">
        <Switch 
          checked={isTrue} 
          onCheckedChange={onChange}
          className="scale-90 data-[state=checked]:bg-indigo-600"
        />
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest w-10">
          {isTrue ? 'True' : 'False'}
        </span>
      </div>
    )
  }

  if ((operator === 'equals' || operator === 'not_equals') && suggestions.length > 0) {
    return renderSuggestionsInput(false)
  }

  return (
    <Input 
      className="h-8 text-xs border-0 bg-zinc-100/50 focus:bg-zinc-100 focus:ring-0 transition-all rounded-xl px-3 font-medium"
      placeholder="Value..."
      value={typeof value === 'string' || typeof value === 'number' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
