import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import type { ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'
import { formatForDisplay } from '@shared/serialization'
import { Copy, ChevronUp, ChevronDown, Calendar, Hash, Type, Braces } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToastStore } from '@/stores/useToastStore'
import { ColumnSchema } from '@shared/types'

interface RowDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: Record<string, unknown> | null
  columns: ColumnSchema[]
  onNavigate?: (direction: 'prev' | 'next') => void
  hasPrev?: boolean
  hasNext?: boolean
}

export function RowDetailSheet({
  open,
  onOpenChange,
  row,
  columns,
  onNavigate,
  hasPrev,
  hasNext,
}: RowDetailSheetProps) {
  const { t } = useTranslation('common')
  const addToast = useToastStore((s) => s.addToast)

  if (!row) return null

  // Group columns by type
  const groups = columns.reduce((acc, col) => {
    let type = 'text'
    const dbType = col.type.toUpperCase()
    if (['INT', 'BIGINT', 'DOUBLE', 'DECIMAL', 'FLOAT', 'NUMBER'].some(k => dbType.includes(k))) type = 'number'
    else if (['DATE', 'TIME', 'TIMESTAMP'].some(k => dbType.includes(k))) type = 'date'
    else if (['JSON', 'STRUCT', 'MAP', 'LIST'].some(k => dbType.includes(k))) type = 'json'
    
    if (!acc[type]) acc[type] = []
    acc[type].push(col)
    return acc
  }, {} as Record<string, typeof columns>)

  const handleCopy = (val: unknown) => {
    navigator.clipboard.writeText(String(val))
    addToast({
      title: t('copied'),
      type: 'success',
    })
  }

  const renderValue = (val: unknown, type: string) => {
    if (val === null || val === undefined) return <span className="text-zinc-300 italic">null</span>
    
    if (type === 'json') {
      try {
        const str = typeof val === 'string' ? val : JSON.stringify(val, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value, 2)
        return <pre className="text-xs bg-zinc-50 p-2 rounded border border-zinc-100 overflow-auto whitespace-pre-wrap">{str}</pre>
      } catch {
        return String(val)
      }
    }

    return <span className="text-zinc-900 break-words whitespace-pre-wrap">{formatForDisplay(val, type)}</span>
  }

  const renderGroup = (title: string, icon: ReactNode, cols: ColumnSchema[]) => {
    if (!cols || cols.length === 0) return null
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3 text-zinc-400 font-bold text-[10px] uppercase tracking-widest">
          {icon}
          {title}
        </div>
        <div className="grid gap-3">
          {cols.map((col) => {
            const alias = col.semantic?.aliases?.[0]
            const description = col.semantic?.description
            
            return (
              <div key={col.name} className="group relative bg-zinc-50/50 border border-zinc-100 rounded-xl p-4 hover:border-indigo-200 hover:bg-white hover:shadow-md transition-all duration-200">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-zinc-900">
                      {alias || col.name}
                    </span>
                    {alias && (
                      <span className="text-[10px] font-mono text-zinc-400">
                        {col.name}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white border border-zinc-100 text-zinc-400 font-mono">
                    {col.type}
                  </span>
                </div>
                <div className="text-sm leading-relaxed">
                  {renderValue(row[col.name], col.type)}
                </div>
                {description && (
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    {description}
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                  onClick={() => handleCopy(row[col.name])}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md md:max-w-lg lg:max-w-xl p-0 flex flex-col bg-white shadow-2xl border-l border-zinc-100">
        {open && (
          <>
            <div className="p-6 pb-4 border-b bg-zinc-50/30">
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2 text-xl font-bold text-zinc-900">
                  <span className="truncate">Row Detail</span>
                  <Badge variant="outline" className="font-mono text-[10px] font-bold text-zinc-400 bg-white">
                    ID #{String(row._ws_row_id) || 'N/A'}
                  </Badge>
                </SheetTitle>
                <SheetDescription className="text-xs text-zinc-500">
                  {t('preview_data')}
                </SheetDescription>
              </SheetHeader>
              
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {onNavigate && (
                    <>
                      <Button variant="outline" size="sm" className="h-8 rounded-lg bg-white shadow-sm border-zinc-200" disabled={!hasPrev} onClick={() => onNavigate('prev')}>
                        <ChevronUp className="h-4 w-4 mr-1" /> Prev
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 rounded-lg bg-white shadow-sm border-zinc-200" disabled={!hasNext} onClick={() => onNavigate('next')}>
                        Next <ChevronDown className="h-4 w-4 ml-1" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6 bg-white">
              <div className="max-w-2xl mx-auto space-y-8 pb-12">
                {renderGroup('Identifiers & Text', <Type className="w-3.5 h-3.5" />, groups.text)}
                {renderGroup('Metrics & Numbers', <Hash className="w-3.5 h-3.5" />, groups.number)}
                {renderGroup('Timeline', <Calendar className="w-3.5 h-3.5" />, groups.date)}
                {renderGroup('Structures', <Braces className="w-3.5 h-3.5" />, groups.json)}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
