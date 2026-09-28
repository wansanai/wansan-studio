import React, { useState, useMemo } from 'react'
import { 
  Search, 
  Eye, 
  EyeOff, 
  Columns as ColumnsIcon,
  X,
  Type,
  Hash,
  Calendar,
  ToggleLeft,
  Sparkles,
  Link as LinkIcon,
  ChevronRight,
  GripVertical
} from 'lucide-react'
import { FileNode, ColumnSchema } from '@shared/types'
import { cn } from '@/utils/cn'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface FieldListSidebarProps {
  file: FileNode
  columnVisibility: Record<string, boolean>
  onVisibilityChange: (visibility: Record<string, boolean>) => void
  columnOrder: string[]
  onOrderChange: (order: string[]) => void
  onClose: () => void
}

/** Helper to get icon for column type */
function getTypeIcon(type: string) {
  const t = type.toUpperCase()
  if (['INT', 'BIGINT', 'DOUBLE', 'DECIMAL', 'FLOAT', 'NUMBER', 'REAL', 'INTEGER'].some(k => t.includes(k))) return <Hash className="w-3 h-3" />
  if (['DATE', 'TIME', 'TIMESTAMP'].some(k => t.includes(k))) return <Calendar className="w-3 h-3" />
  if (['BOOLEAN'].includes(t)) return <ToggleLeft className="w-3 h-3" />
  return <Type className="w-3 h-3" />
}

interface SortableFieldItemProps {
  col: ColumnSchema
  isVisible: boolean
  onToggle: (name: string) => void
}

const SortableFieldItem = ({ col, isVisible, onToggle }: SortableFieldItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.name })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 40 : 'auto',
    position: 'relative' as const,
  }

  const isMetric = col.sourceType === 'metric'
  const isAI = col.sourceType === 'ai'
  const isJoined = col.sourceType === 'joined'
  const alias = col.semantic?.aliases?.[0]
  const displayName = alias ? `${alias} (${col.name})` : col.name

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
        isVisible ? "hover:bg-zinc-50" : "opacity-50 grayscale hover:bg-zinc-50",
        isDragging && "bg-white shadow-lg ring-1 ring-black/5"
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-zinc-300 hover:text-zinc-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <div 
        className="flex-1 flex items-center gap-2 min-w-0 cursor-pointer"
        onClick={() => onToggle(col.name)}
      >
        <div className={cn(
          "p-1 rounded flex-shrink-0",
          isMetric ? "bg-green-50 text-green-600" :
          isAI ? "bg-purple-50 text-purple-600" :
          isJoined ? "bg-orange-50 text-orange-600" :
          "bg-zinc-100 text-zinc-400"
        )}>
          {isMetric ? <ChevronRight className="w-3 h-3" /> :
           isAI ? <Sparkles className="w-3 h-3" /> :
           isJoined ? <LinkIcon className="w-3 h-3" /> :
           getTypeIcon(col.type)}
        </div>
        
        <span className={cn(
          "text-xs flex-1 truncate",
          isVisible ? "text-zinc-700 font-medium" : "text-zinc-400"
        )} title={displayName}>
          {displayName}
        </span>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isVisible ? <Eye className="w-3.5 h-3.5 text-indigo-500" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-300" />}
        </div>
      </div>
    </div>
  )
}

export function FieldListSidebar({ 
  file, 
  columnVisibility, 
  onVisibilityChange,
  columnOrder,
  onOrderChange,
  onClose 
}: FieldListSidebarProps) {
  const [search, setSearch] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // We use viewSchema if available (enriched), otherwise physical columns
  const allColumns = useMemo(() => {
    const cols = (file.viewSchema && file.viewSchema.length > 0) 
      ? file.viewSchema 
      : file.columns
    
    // Sort based on columnOrder if provided
    if (columnOrder && columnOrder.length > 0) {
      const orderMap = new Map(columnOrder.map((name, index) => [name, index]))
      return [...cols].sort((a, b) => {
        const indexA = orderMap.has(a.name) ? orderMap.get(a.name)! : 999
        const indexB = orderMap.has(b.name) ? orderMap.get(b.name)! : 999
        return indexA - indexB
      })
    }
    return cols
  }, [file.viewSchema, file.columns, columnOrder])

  const filteredColumns = allColumns.filter(c => {
    const isSystem = c.name === '_ws_row_id'
    if (isSystem) return false
    
    const searchLower = search.toLowerCase()
    const nameMatch = c.name.toLowerCase().includes(searchLower)
    const aliasMatch = c.semantic?.aliases?.some(a => a.toLowerCase().includes(searchLower))
    
    return nameMatch || aliasMatch
  })

  const handleToggleVisibility = (colName: string) => {
    const isVisible = columnVisibility[colName] !== false
    onVisibilityChange({
      ...columnVisibility,
      [colName]: !isVisible
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = columnOrder.indexOf(active.id as string)
      const newIndex = columnOrder.indexOf(over.id as string)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onOrderChange(arrayMove(columnOrder, oldIndex, newIndex))
      }
    }
  }

  const showAll = () => {
    const newVisibility: Record<string, boolean> = {}
    allColumns.forEach(c => newVisibility[c.name] = true)
    onVisibilityChange(newVisibility)
  }

  const hideAll = () => {
    const newVisibility: Record<string, boolean> = {}
    allColumns.forEach(c => newVisibility[c.name] = false)
    onVisibilityChange(newVisibility)
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-zinc-200 shadow-xl w-64 z-30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/50">
        <div className="flex items-center gap-2">
          <ColumnsIcon className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-bold text-zinc-700">Fields</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {allColumns.filter(c => c.name !== '_ws_row_id').length}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Search & Bulk Actions */}
      <div className="p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <Input 
            placeholder="Search fields..." 
            className="pl-8 h-9 text-xs rounded-lg border-zinc-100 focus:ring-indigo-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] font-bold uppercase tracking-wider" onClick={showAll}>Show All</Button>
          <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] font-bold uppercase tracking-wider" onClick={hideAll}>Hide All</Button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="px-2 pb-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredColumns.map(c => c.name)}
              strategy={verticalListSortingStrategy}
            >
              {filteredColumns.map(col => (
                <SortableFieldItem
                  key={col.name}
                  col={col}
                  isVisible={columnVisibility[col.name] !== false}
                  onToggle={handleToggleVisibility}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  )
}
