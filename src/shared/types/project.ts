import { Message } from './chat'
import { ReportWidget, ReportData } from './dashboard'
import { FileNode, DomainRule, SmartMetric, TableRelation } from '../types'
import { FilterRule, FilterState } from './filter'

export interface Relation {
  id: string
  fileAId: string
  columnA: string
  fileBId: string
  columnB: string
  autoDetected?: boolean
}

export type ViewMode = 'chat' | 'schema' | 'preview'
export type ExplorerViewMode =
  | 'default_clean'
  | 'saved_clean'
  | 'saved_dirty'
  | 'unsaved_custom'
  | 'partially_invalid'

export interface QueryState {
  filterDraft: FilterState
  filterApplied: FilterState
  sorting: Array<{ id: string; desc: boolean }>
  searchText?: string
}

export interface PresentationState {
  columnVisibility: Record<string, boolean>
  columnOrder: string[]
  columnWidths?: Record<string, number>
}

export interface ExplorerState {
  fileId: string
  viewId: string | null
  queryState: QueryState
  presentationState: PresentationState
  dirty: boolean
}

export interface TableView {
  id: string
  name: string
  filters: FilterState | FilterRule[] // Support migration from old array to new state object
  columnConfig?: {
    hidden?: string[]
    order?: string[]
    widths?: Record<string, number>
  }
  sort?: { id: string; desc: boolean }[]
  meta?: {
    updatedAt: number
    filterCount: number
    hiddenCount: number
    sortCount: number
    schemaHash?: string
  }
}

export interface Session {
  id: string
  title: string
  createdAt: number
  lastModified: number
  messages: Message[]
  replyToId?: string
  inputDraft?: string
  dashboard: {
    widgets: ReportWidget[]
    layoutMode: 'a4' | 'screen' | 'report'
    pageCount: number
    zoom: number
  }
}

export interface ProjectMeta {
  id: string
  name: string
  version: string
  created: number
}

export interface ProjectData {
  meta: ProjectMeta
  files: FileNode[]
  sessions: Session[]
  activeSessionId: string
  activeView: ViewMode
  appMode?: 'analysis' | 'data' // [NEW] v1.7
  activeFileId: string | null
  widgetRegistry: Record<string, ReportData>
  smartMetrics?: SmartMetric[]
  relations?: TableRelation[]
  domainRules?: DomainRule[]
  suggestedPrompts?: string[]
  tableViews?: Record<string, TableView[]> // [NEW] v1.7.5
}
