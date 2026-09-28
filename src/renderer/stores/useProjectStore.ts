import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ProjectData, Session, ViewMode } from '@shared/types/project'
import { Message } from '@shared/types/chat'
import { ReportData, ReportWidget } from '@shared/types/dashboard'
import {
  ColumnSchema,
  ContextAnalysisResult,
  DataSourceConfig,
  FileNode,
  SelectedNode,
  SmartMetric,
  TableRelation,
} from '@shared/types'
import { Layout } from 'react-grid-layout'
import { createBigIntStorage } from '@shared/serialization'
import { Analytics } from '../services/analytics'
import { FilterParam } from '@shared/schemas/analysis'
import { DuckDBViewManager } from '../lib/duckdb-view-manager'
import { useToastStore } from './useToastStore'
import { normalizeDuckDBType } from '@shared/type-utils'
import { getSidecarTableName, getLogicalViewName } from '@shared/naming-utils'

// 生成唯一 ID
const generateId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

export type LayoutScenario = 'default' | 'print' | 'large' | 'ppt' | 'email'
export type Language = 'en' | 'zh'

export interface SmartFilterRequest {
  isOpen: boolean
  params: FilterParam[]
  templateSql: string
  resolve: (result: { sql: string; params: Record<string, string[]> }) => void
  reject: (reason?: any) => void
}

export interface ProjectState extends ProjectData {
  appMode: 'analysis' | 'data' // [NEW] Master Mode Switch
  sidebarMode: 'sessions' | 'data'
  layoutScenario: LayoutScenario
  editingReportId: string | null
  pendingReplace: { fileId: string; newPath: string; missing: string[] } | null
  showRefreshConfirm: boolean
  suggestedPrompts: string[]
  selectedNode: SelectedNode | null
  isRestoring: boolean
  isRefreshing: boolean
  abortControllers: Record<string, AbortController>
  smartFilterRequest: SmartFilterRequest | null
  analysisReviewResult: ContextAnalysisResult | null
  isSmartModelingOpen: boolean // [NEW]
  currentProjectPath: string | null
  isProjectLoaded: boolean // Transient flag to indicate project fully loaded

  // Actions
  setAppMode: (mode: 'analysis' | 'data') => void // [NEW]
  setSidebarMode: (mode: 'sessions' | 'data') => void
  setView: (view: ViewMode) => void
  setActiveFile: (id: string | null) => void
  setActiveSession: (id: string | null) => void
  setProjectPath: (path: string | null) => void
  setPendingReplace: (
    payload: { fileId: string; newPath: string; missing: string[] } | null
  ) => void
  setShowRefreshConfirm: (open: boolean) => void
  setRefreshing: (val: boolean) => void
  setSmartModelingOpen: (open: boolean) => void // [NEW]
  refreshSessionWidgets: () => Promise<void>
  confirmReplace: () => Promise<void>
  createSession: () => void
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, name: string) => void
  clearSessionMessages: (id: string) => void
  addMessage: (message: Message) => void
  updateMessage: (
    id: string,
    updates: Partial<Message> & { reportData?: ReportData }
  ) => void
  deleteMessage: (id: string) => void
  setReplyTo: (messageId: string | null) => void
  setInputDraft: (draft: string, sessionId?: string) => void
  setAbortController: (ac: AbortController | null) => void
  addWidget: (widget: ReportWidget | any) => void
  removeWidget: (id: string) => void
  updateWidget: (
    id: string,
    update: Partial<ReportWidget> | ((w: ReportWidget) => ReportWidget)
  ) => void
  updateWidgetData: (id: string, update: Partial<ReportData>) => void
  updateRegistryByWidgetId: (
    widgetId: string,
    updates: Partial<ReportData>
  ) => void
  updateLayout: (layout: Layout[]) => void
  setCanvasConfig: (config: any) => void
  setLayoutScenario: (scenario: LayoutScenario) => void
  setEditingReportId: (id: string | null) => void
  setProjectName: (name: string) => void
  setSelectedNode: (node: SelectedNode | null) => void
  setRestoring: (val: boolean) => void
  setSuggestedPrompts: (prompts: string[]) => void
  setSmartFilterRequest: (req: SmartFilterRequest | null) => void
  setAnalysisReviewResult: (result: ContextAnalysisResult | null) => void
  applyAnalysisResult: (data: {
    selectedRelations: any[]
    selectedPrompts: string[]
  }) => Promise<void>
  addFile: (
    file: Partial<FileNode> & { name: string; source: DataSourceConfig; tableName: string }
  ) => string
  removeFile: (id: string) => Promise<void>
  updateFile: (id: string, updates: Partial<FileNode>) => void
  bulkUpdateFiles: (updates: Record<string, Partial<FileNode>>) => void
  updateFileProgress: (id: string, progress: number) => void
  updateColumn: (
    fileId: string,
    columnName: string,
    updates: Partial<ColumnSchema>
  ) => void
  updateColumnSemantic: (
    fileId: string,
    columnName: string,
    semantic: Partial<import('@shared/types').ColumnSemantic>
  ) => void
  removeColumn: (fileId: string, columnName: string) => Promise<void> // [NEW] v1.7.5
  toggleKeyColumn: (fileId: string, columnName: string) => void
  addRelation: (
    relation: Omit<TableRelation, 'id'> & { sourceFileId: string }
  ) => void
  removeRelation: (id: string) => void
  addSmartMetric: (fileId: string, metric: SmartMetric) => Promise<void>
  updateSmartMetric: (
    fileId: string,
    metricId: string,
    updates: Partial<SmartMetric>
  ) => Promise<void>
  removeSmartMetric: (fileId: string, metricId: string) => Promise<void>
  markAsStale: (ids: string[]) => void
  markFileMissing: (id: string) => void
  reloadFile: (
    fileId: string,
    result: { lastModified: number; newColumns: ColumnSchema[] }
  ) => number
  addDomainRule: (content: string) => void
  toggleDomainRule: (id: string) => void
  removeDomainRule: (id: string) => void
  updateDomainRule: (id: string, content: string) => void
  reorderDomainRules: (oldIndex: number, newIndex: number) => void
  replaceFile: (
    fileId: string,
    newPath: string,
    force?: boolean
  ) => Promise<'completed' | 'cancelled' | 'pending' | 'error'>
  loadProject: (data: ProjectData) => void
  cleanupZombieFiles: () => void
  refreshFileMetadata: (fileId: string) => Promise<void> // [NEW] v1.7.5
  reset: () => void
  closeProject: () => Promise<void>

  // [NEW] v1.7.5 Table Views
  saveTableView: (fileId: string, view: import('@shared/types/project').TableView) => void
  deleteTableView: (fileId: string, viewId: string) => void
  updateTableView: (fileId: string, viewId: string, updates: Partial<import('@shared/types/project').TableView>) => void
}

const createNewSession = (): Session => ({
  id: crypto.randomUUID(),
  title: 'New Session',
  createdAt: Date.now(),
  lastModified: Date.now(),
  messages: [],
  replyToId: undefined,
  inputDraft: '',
  dashboard: {
    widgets: [],
    layoutMode: 'report',
    pageCount: 1,
    zoom: 80,
  },
})

const initialProjectState: ProjectData & {
  currentProjectPath: string | null
  isProjectLoaded: boolean
  editingReportId: string | null
} = {
  meta: {
    id: crypto.randomUUID(),
    name: 'My Workspace',
    version: __APP_VERSION__,
    created: Date.now(),
  },
  files: [],
  sessions: [],
  activeSessionId: '',
  activeView: 'chat',
  appMode: 'analysis', // [NEW] Default to analysis
  activeFileId: null,
  widgetRegistry: {},
  currentProjectPath: null,
  isProjectLoaded: false,
  editingReportId: null,
  tableViews: {},
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      ...initialProjectState,
      abortControllers: {},
      layoutScenario: 'default',
      pendingReplace: null,
      showRefreshConfirm: false,
      sidebarMode: 'sessions',
      suggestedPrompts: [],
      selectedNode: null,
      isRestoring: false,
      isRefreshing: false,
      smartFilterRequest: null,
      analysisReviewResult: null,
      isSmartModelingOpen: false,
      appMode: 'analysis',

      setAppMode: mode =>
        set(_state => {
          if (mode === 'data') {
            return {
              appMode: mode,
              sidebarMode: 'data',
              activeView: 'preview'
            }
          } else {
            return {
              appMode: mode,
              sidebarMode: 'sessions',
              activeView: 'chat'
            }
          }
        }),

      setSidebarMode: mode =>
        set(_state => {
          const updates: Partial<ProjectState> = { sidebarMode: mode }
          if (mode === 'sessions') {
            updates.activeView = 'chat'
          }
          return updates
        }),
      setView: view =>
        set(state => {
          let newSidebarMode = state.sidebarMode
          if (view === 'schema') {
            newSidebarMode = 'data'
          } else if (view === 'chat') {
            newSidebarMode = 'sessions'
          }
          return { activeView: view, sidebarMode: newSidebarMode }
        }),
      setActiveFile: id =>
        set({
          activeFileId: id,
          sidebarMode: 'data',
          selectedNode: id ? { id, type: 'file' } : null,
        }),
      setActiveSession: id => set({ activeSessionId: id }),
      setProjectPath: path => set({ currentProjectPath: path }),
      setPendingReplace: payload => set({ pendingReplace: payload }),
      setShowRefreshConfirm: open => set({ showRefreshConfirm: open }),
      setRefreshing: val => set({ isRefreshing: val }),
      setSmartModelingOpen: open => set({ isSmartModelingOpen: open }),
      setSmartFilterRequest: req => set({ smartFilterRequest: req }),
      setAnalysisReviewResult: result => set({ analysisReviewResult: result }),

      applyAnalysisResult: async ({
        selectedRelations,
        selectedPrompts,
      }) => {
        const {
          addRelation,
          setSuggestedPrompts,
          files,
        } = get()

        // 1. Add Relations
        for (const rel of selectedRelations) {
          const fileA = files.find(f => f.tableName === rel.sourceTable)
          const fileB = files.find(f => f.tableName === rel.targetTable)
          
          if (fileA && fileB) {
            // Check for duplicates handled inside addRelation, but we call it sequentially
            addRelation({
              sourceFileId: fileA.id,
              sourceColumn: rel.sourceColumn,
              targetFileId: fileB.id,
              targetColumn: rel.targetColumn,
              autoDetected: true,
            })
          }
        }

        // 2. Update Prompts (Direct Replacement)
        if (selectedPrompts.length > 0) {
          setSuggestedPrompts(selectedPrompts)
        }

        // Clear modal
        set({ analysisReviewResult: null })
      },

      refreshSessionWidgets: async () => {
        const state = get()
        const session = state.sessions.find(s => s.id === state.activeSessionId)
        if (!session) return

        const updatedRegistry = { ...state.widgetRegistry }
        let hasUpdates = false

        await Promise.all(
          session.dashboard.widgets.map(async w => {
            const reportData = updatedRegistry[w.widgetId]
            if (!reportData?.sql) return

            try {
              const res = await window.electronAPI.runSQL(reportData.sql)
              if (res.success && res.data) {
                const { data, columnFields } = res.data
                updatedRegistry[w.widgetId] = {
                  ...reportData,
                  tableData: data,
                  columnFields,
                  timestamp: Date.now(),
                }
                hasUpdates = true
              }
            } catch (e) {
              console.error('Widget refresh failed', w.id, e)
            }
          })
        )

        if (hasUpdates) {
          set({ widgetRegistry: updatedRegistry })
        }
      },

      confirmReplace: async () => {
        const { pendingReplace, replaceFile } = get()
        if (!pendingReplace) return

        const status = await replaceFile(
          pendingReplace.fileId,
          pendingReplace.newPath,
          true
        )
        const hasWarning = (pendingReplace.missing?.length || 0) > 0
        const fileType = pendingReplace.newPath.split('.').pop()

        set({ pendingReplace: null })

        if (status === 'completed') {
          Analytics.track('data_replaced', {
            has_warning: hasWarning,
            file_type: fileType,
          })
          set({ showRefreshConfirm: true })
        }
      },

      createSession: () =>
        set(state => {
          const newSession = createNewSession()

          const nextSessions = [...state.sessions, newSession]
          Analytics.track('session_created', {
            session_count: nextSessions.length,
          })

          return {
            sessions: nextSessions,
            activeSessionId: newSession.id,
          }
        }),

      switchSession: (id: string) =>
        set(state => {
          if (state.sessions.some(s => s.id === id)) {
            return { activeSessionId: id }
          }
          return state
        }),

      deleteSession: (id: string) =>
        set(state => {
          const newSessions = state.sessions.filter(s => s.id !== id)
          let newActiveId = state.activeSessionId
          if (id === state.activeSessionId) {
            newActiveId = newSessions.length > 0 ? newSessions[0].id : ''
          }

          const { [id]: _, ...remainingControllers } = state.abortControllers

          return {
            sessions: newSessions,
            activeSessionId: newActiveId,
            abortControllers: remainingControllers,
          }
        }),

      renameSession: (id: string, name: string) =>
        set(state => {
          const session = state.sessions.find(s => s.id === id)
          let nextRegistry = state.widgetRegistry

          // Attempt to sync title widget
          if (session) {
            const titleWidget = session.dashboard.widgets.find(
              w => w.sourceMessageId === 'system'
            )
            if (titleWidget) {
              const wId = titleWidget.widgetId
              const currentData = nextRegistry[wId] || {}
              // Only update if it exists
              if (currentData) {
                nextRegistry = {
                  ...nextRegistry,
                  [wId]: {
                    ...currentData,
                    title: name,
                    content: name,
                  } as ReportData,
                }
              }
            }
          }

          return {
            widgetRegistry: nextRegistry,
            sessions: state.sessions.map(s =>
              s.id === id ? { ...s, title: name, lastModified: Date.now() } : s
            ),
          }
        }),

      clearSessionMessages: sessionId =>
        set(state => {
          const session = state.sessions.find(s => s.id === sessionId)
          if (!session) return state

          // Collect all widget IDs from both messages AND dashboard
          const widgetIdsToRemove = new Set([
            ...session.messages.map(m => m.widgetId).filter(Boolean),
            ...session.dashboard.widgets.map(w => w.widgetId).filter(Boolean),
          ])

          const newRegistry = { ...state.widgetRegistry }
          widgetIdsToRemove.forEach(id => {
            if (id) delete newRegistry[id]
          })

          return {
            widgetRegistry: newRegistry,
            sessions: state.sessions.map(s =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: [],
                    dashboard: { ...s.dashboard, widgets: [] },
                    lastModified: Date.now(),
                  }
                : s
            ),
          }
        }),

      addMessage: msg =>
        set(state => {
          let nextRegistry = state.widgetRegistry
          const nextMsg = { ...msg } as Message

          if (msg.reportData) {
            const widgetId = crypto.randomUUID()
            nextRegistry = {
              ...nextRegistry,
              [widgetId]: msg.reportData,
            }
            nextMsg.widgetId = widgetId
            delete (nextMsg as any).reportData
          }

          return {
            widgetRegistry: nextRegistry,
            sessions: state.sessions.map(s =>
              s.id === state.activeSessionId
                ? {
                    ...s,
                    messages: [...s.messages, nextMsg],
                    lastModified: Date.now(),
                  }
                : s
            ),
          }
        }),

      updateMessage: (id, update) =>
        set(state => {
          const session = state.sessions.find(
            s => s.id === state.activeSessionId
          )
          if (!session) return state

          const existingMsg = session.messages.find(m => m.id === id)
          if (!existingMsg) return state

          const nextRegistry = { ...state.widgetRegistry }
          const nextUpdate = { ...update } as Partial<Message>

          if (update.reportData) {
            const wId = existingMsg.widgetId || crypto.randomUUID()
            const existingData = nextRegistry[wId] || ({} as ReportData)
            nextRegistry[wId] = {
              ...existingData,
              ...update.reportData,
            } as ReportData

            nextUpdate.widgetId = wId
            nextUpdate.reportData = undefined // Explicitly clear to force registry resolution
          }

          return {
            widgetRegistry: nextRegistry,
            sessions: state.sessions.map(s =>
              s.id === state.activeSessionId
                ? {
                    ...s,
                    messages: s.messages.map(m =>
                      m.id === id ? { ...m, ...nextUpdate } : m
                    ),
                    lastModified: Date.now(),
                  }
                : s
            ),
          }
        }),

      deleteMessage: id =>
        set(state => {
          const session = state.sessions.find(
            s => s.id === state.activeSessionId
          )
          if (!session) return state

          const message = session.messages.find(m => m.id === id)
          if (!message) return state

          let nextRegistry = state.widgetRegistry
          let nextDashboard = session.dashboard

          if (message.widgetId) {
            // Remove from registry
            const { [message.widgetId]: _, ...remainingRegistry } = nextRegistry
            nextRegistry = remainingRegistry

            // Remove from dashboard widgets
            nextDashboard = {
              ...nextDashboard,
              widgets: nextDashboard.widgets.filter(
                w => w.widgetId !== message.widgetId
              ),
            }
          }

          return {
            widgetRegistry: nextRegistry,
            sessions: state.sessions.map(s =>
              s.id === state.activeSessionId
                ? {
                    ...s,
                    dashboard: nextDashboard,
                    messages: s.messages.filter(m => m.id !== id),
                    lastModified: Date.now(),
                  }
                : s
            ),
          }
        }),

      setReplyTo: (replyToId: string | null) =>
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === state.activeSessionId
              ? { ...s, replyToId: replyToId ?? undefined }
              : s
          ),
        })),

      setInputDraft: (draft, sessionId) =>
        set(state => {
          const targetId = sessionId || state.activeSessionId
          if (!targetId) return state
          return {
            sessions: state.sessions.map(s =>
              s.id === targetId ? { ...s, inputDraft: draft } : s
            ),
          }
        }),

      setAbortController: (controller: AbortController | null) =>
        set(state => {
          if (!state.activeSessionId) return state

          const newControllers = { ...state.abortControllers }
          if (controller) {
            newControllers[state.activeSessionId] = controller
          } else {
            delete newControllers[state.activeSessionId]
          }
          return { abortControllers: newControllers }
        }),

      addWidget: widget =>
        set(state => {
          let nextRegistry = state.widgetRegistry
          const nextWidget = { ...widget } as ReportWidget

          if (widget.reportData) {
            // Use provided widgetId or generate new one
            const wId = widget.widgetId || crypto.randomUUID()

            // If reusing widgetId, we overwrite registry data?
            // Yes, assuming the latest data is passed.
            // Or we could check if it exists.
            // For strong consistency, updating registry with latest reportData is correct.
            nextRegistry = { ...nextRegistry, [wId]: widget.reportData }

            nextWidget.widgetId = wId
            delete (nextWidget as any).reportData
          }

          return {
            widgetRegistry: nextRegistry,
            sessions: state.sessions.map(s =>
              s.id === state.activeSessionId
                ? {
                    ...s,
                    dashboard: {
                      ...s.dashboard,
                      widgets: [...s.dashboard.widgets, nextWidget],
                    },
                    lastModified: Date.now(),
                  }
                : s
            ),
          }
        }),

      removeWidget: (id: string) =>
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === state.activeSessionId
              ? {
                  ...s,
                  dashboard: {
                    ...s.dashboard,
                    widgets: s.dashboard.widgets.filter(w => w.id !== id),
                  },
                  lastModified: Date.now(),
                }
              : s
          ),
        })),

      updateWidget: (
        id: string,
        update: Partial<ReportWidget> | ((w: ReportWidget) => ReportWidget)
      ) =>
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === state.activeSessionId
              ? {
                  ...s,
                  dashboard: {
                    ...s.dashboard,
                    widgets: s.dashboard.widgets.map(w => {
                      if (w.id !== id) return w
                      if (typeof update === 'function') {
                        return update(w)
                      }
                      return { ...w, ...update }
                    }),
                  },
                  lastModified: Date.now(),
                }
              : s
          ),
        })),

      updateWidgetData: (id, update) =>
        set(state => {
          const session = state.sessions.find(
            s => s.id === state.activeSessionId
          )
          if (!session) return state
          const widget = session.dashboard.widgets.find(w => w.id === id)
          if (!widget) return state

          const wId = widget.widgetId
          const currentData = state.widgetRegistry[wId] || ({} as ReportData)

          return {
            widgetRegistry: {
              ...state.widgetRegistry,
              [wId]: { ...currentData, ...update } as ReportData,
            },
            sessions: state.sessions.map(s =>
              s.id === state.activeSessionId
                ? { ...s, lastModified: Date.now() }
                : s
            ),
          }
        }),

      updateRegistryByWidgetId: (widgetId, updates) =>
        set(state => {
          const currentData = state.widgetRegistry[widgetId]
          if (!currentData) return state
          return {
            widgetRegistry: {
              ...state.widgetRegistry,
              [widgetId]: { ...currentData, ...updates } as ReportData,
            },
            sessions: state.sessions.map(s =>
              s.id === state.activeSessionId
                ? { ...s, lastModified: Date.now() }
                : s
            ),
          }
        }),

      updateLayout: (layout: any) =>
        set(state => {
          if (Array.isArray(layout)) {
            const layoutMap = new Map(layout.map((l: any) => [l.i, l]))
            return {
              sessions: state.sessions.map(s =>
                s.id === state.activeSessionId
                  ? {
                      ...s,
                      dashboard: {
                        ...s.dashboard,
                        widgets: s.dashboard.widgets.map(w => {
                          const newL = layoutMap.get(w.id)
                          return newL
                            ? { ...w, layout: { ...w.layout, ...newL } }
                            : w
                        }),
                      },
                      lastModified: Date.now(),
                    }
                  : s
              ),
            }
          }
          return state
        }),

      setCanvasConfig: (config: any) =>
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === state.activeSessionId
              ? {
                  ...s,
                  dashboard: {
                    ...s.dashboard,
                    ...config,
                  },
                  title: config.title ?? s.title, // Sync title
                  lastModified: Date.now(),
                }
              : s
          ),
        })),

      setLayoutScenario: (scenario: LayoutScenario) =>
        set({ layoutScenario: scenario }),
      setEditingReportId: (id: string | null) => set({ editingReportId: id }),

      setProjectName: name => set(state => ({ meta: { ...state.meta, name } })),
      setSelectedNode: node => set({ selectedNode: node }),
      setRestoring: val => set({ isRestoring: val }),
      setSuggestedPrompts: prompts => set({ suggestedPrompts: prompts }),

      addFile: file => {
        const id = generateId()
        const now = Date.now()
        const newFile: FileNode = {
          ...file,
          id,
          createdAt: now,
          lastModified: now,
          status: file.status || 'ready',
        } as FileNode
        set(state => ({
          files: [...state.files, newFile],
        }))

        // Analytics tracking based on source type
        let ext = 'unknown'
        if (file.source?.type === 'local_file') {
          ext = file.source.path.split('.').pop()?.toLowerCase() || 'unknown'
        } else if (file.source?.type === 'database') {
          ext = 'db_table'
        }
        Analytics.track('file_imported', { file_type: ext })
        
        // [V1.7] Initial View Build (Fire and Forget)
        // We need to ensure the v_table exists immediately for Data Grid
        setTimeout(() => {
            const currentState = get()
            const addedFile = currentState.files.find(f => f.id === id)
            if (addedFile) {
                const relations = selectAllRelations(currentState)
                DuckDBViewManager.rebuildView(addedFile, currentState.files, relations)
                    .catch(e => console.error('Initial view build failed', e))
            }
        }, 0)

        return id
      },

      removeFile: async id => {
        const { files } = get()
        const file = files.find(f => f.id === id)

        if (file) {
          try {
            // 1. Physical Delete: Main Table, Sidecar, and Sequence (via cascade backend)
            await window.electronAPI.deleteTable(file.tableName)
            
            // 2. Logic Delete: View
            await window.electronAPI.runSQL(`DROP VIEW IF EXISTS "${getLogicalViewName(file.tableName)}"`)
          } catch (e) {
            console.error('Failed to drop resources', e)
          }
        }

        set(state => ({
          files: state.files
            .filter(f => f.id !== id)
            .map(f => ({
              ...f,
              relations: (f.relations || []).filter(r => r.targetFileId !== id),
            })),
        }))
      },

      updateFile: (id, updates) =>
        set(state => ({
          files: state.files.map(f => (f.id === id ? { ...f, ...updates } : f)),
        })),

      bulkUpdateFiles: updates =>
        set(state => ({
          files: state.files.map(f =>
            updates[f.id] ? { ...f, ...updates[f.id] } : f
          ),
        })),

      updateFileProgress: (id, progress) =>
        set(state => ({
          files: state.files.map(f => (f.id === id ? { ...f, progress } : f)),
        })),

      updateColumn: (fileId, columnName, updates) => {
        set(state => ({
          files: state.files.map(f =>
            f.id === fileId
              ? {
                  ...f,
                  columns: f.columns.map(c =>
                    c.name === columnName ? { ...c, ...updates } : c
                  ),
                }
              : f
          ),
        }))
      },

      updateColumnSemantic: (fileId, columnName, semanticUpdates) => {
        set(state => ({
          files: state.files.map(f =>
            f.id === fileId
              ? {
                  ...f,
                  columns: f.columns.map(c =>
                    c.name === columnName
                      ? {
                          ...c,
                          semantic: {
                            ...(c.semantic || { isVisibleToAI: true }),
                            ...semanticUpdates,
                          },
                        }
                      : c
                  ),
                }
              : f
          ),
        }))
      },

      removeColumn: async (fileId, columnName) => {
        const state = get()
        const file = state.files.find(f => f.id === fileId)
        if (!file) return

        const col = file.columns.find(c => c.name === columnName)
        if (!col) return

        // --- OPTIMISTIC UPDATE ---
        // Immediately remove from UI to ensure instant feedback in Columns list
        set(prev => {
          const currentViews = (prev.tableViews || {})[fileId] || []
          const updatedViews = currentViews.map(view => {
            // Cleanup Filters
            const updatedFilters = typeof view.filters === 'object' && view.filters !== null && 'conditions' in view.filters
              ? { ...view.filters, conditions: view.filters.conditions.filter((c: any) => c.columnName !== columnName) }
              : Array.isArray(view.filters) 
                ? view.filters.filter((c: any) => c.columnName !== columnName)
                : view.filters

            return {
              ...view,
              filters: updatedFilters,
              // Cleanup Sort
              sort: (view.sort || []).filter(s => s.id !== columnName),
              // Cleanup Column Config
              columnConfig: {
                ...view.columnConfig,
                order: (view.columnConfig?.order || []).filter(c => c !== columnName),
                hidden: (view.columnConfig?.hidden || []).filter(c => c !== columnName),
              }
            }
          })

          return {
            files: prev.files.map(f => {
              if (f.id !== fileId) return f
              
              // Cleanup active displayState
              const ds = f.displayState
              const updatedDisplayState = ds ? {
                ...ds,
                sorting: (ds.sorting || []).filter(s => s.id !== columnName),
                filterState: ds.filterState ? {
                  ...ds.filterState,
                  conditions: (ds.filterState.conditions || []).filter(c => c.columnName !== columnName)
                } : ds.filterState,
                columnOrder: (ds.columnOrder || []).filter(c => c !== columnName),
                columnVisibility: ds.columnVisibility ? (() => {
                  const { [columnName]: _, ...rest } = ds.columnVisibility
                  return rest
                })() : ds.columnVisibility
              } : ds

              return {
                ...f,
                columns: f.columns.filter(c => c.name !== columnName),
                viewSchema: f.viewSchema?.filter(c => c.name !== columnName),
                displayState: updatedDisplayState
              }
            }),
            tableViews: {
              ...prev.tableViews,
              [fileId]: updatedViews
            }
          }
        })

        try {
          if (col.sourceType === 'metric') {
            // 1. Handle Metric Deletion
            const metric = (file.smartMetrics || []).find(m => m.name === columnName)
            if (metric) {
              await get().removeSmartMetric(fileId, metric.id)
            }
          } else if (col.sourceType === 'ai') {
            // 2. Handle AI Column Deletion (Physical)
            const res = await window.electronAPI.dropAIColumn({
              tableName: file.tableName,
              columnName: col.name
            })
            if (!res.success) throw new Error(res.error)
          }

          // FINAL SYNC: refreshFileMetadata internally calls rebuildView and updates lastModified
          await get().refreshFileMetadata(fileId)
          
        } catch (e: any) {
          console.error('[ProjectStore] removeColumn failed', e)
          // Rollback on error (re-sync)
          await get().refreshFileMetadata(fileId)
          
          useToastStore.getState().addToast({
            title: 'Delete failed',
            description: e.message,
            type: 'error'
          })
        }
      },

      toggleKeyColumn: (fileId, columnName) => {
        const file = get().files.find(f => f.id === fileId)
        if (!file) return

        const column = file.columns.find(c => c.name === columnName)
        if (!column) return

        get().updateColumn(fileId, columnName, {
          isPrimaryKey: !column.isPrimaryKey,
        })
      },

      addRelation: async relation => {
        const { sourceFileId, ...data } = relation
        const state = get()
        const sourceFile = state.files.find(f => f.id === sourceFileId)
        if (!sourceFile) return

        const exists = (sourceFile.relations || []).some(
          r =>
            r.targetFileId === data.targetFileId &&
            r.sourceColumn === data.sourceColumn &&
            r.targetColumn === data.targetColumn
        )
        if (exists) {
          console.warn('Relationship already exists.')
          return
        }
        const id = generateId()
        const newRelation = { ...data, id, joinType: 'LEFT' as const }

        set(state => ({
          files: state.files.map(f =>
            f.id === sourceFileId
              ? { ...f, relations: [...(f.relations || []), newRelation] }
              : f
          ),
        }))

        // Rebuild View & Update viewSchema
        const updatedState = get()
        const updatedSource = updatedState.files.find(f => f.id === sourceFileId)
        if (updatedSource) {
          const allRelations = selectAllRelations(updatedState)
          const viewSchema = await DuckDBViewManager.rebuildView(
            updatedSource,
            updatedState.files,
            allRelations
          )
          set(prev => ({
            files: prev.files.map(f =>
              f.id === sourceFileId ? { ...f, viewSchema } : f
            ),
          }))
        }
      },

      removeRelation: async id => {
        let sourceFileId = ''
        set(state => {
          const file = state.files.find(f =>
            (f.relations || []).some(r => r.id === id)
          )
          if (file) sourceFileId = file.id
          return {
            files: state.files.map(f => ({
              ...f,
              relations: (f.relations || []).filter(r => r.id !== id),
            })),
          }
        })

        if (sourceFileId) {
          const state = get()
          const file = state.files.find(f => f.id === sourceFileId)
          if (file) {
            const allRelations = selectAllRelations(state)
            const viewSchema = await DuckDBViewManager.rebuildView(
              file,
              state.files,
              allRelations
            )
            set(prev => ({
              files: prev.files.map(f =>
                f.id === sourceFileId ? { ...f, viewSchema } : f
              ),
            }))
          }
        }
      },

      addSmartMetric: async (fileId, metric) => {
        set(state => ({
          files: state.files.map(f =>
            f.id === fileId
              ? { ...f, smartMetrics: [...(f.smartMetrics || []), metric] }
              : f
          ),
        }))

        const state = get()
        const updatedFile = state.files.find(f => f.id === fileId)

        if (updatedFile) {
          try {
            const allRelations = selectAllRelations(state)
            const viewSchema = await DuckDBViewManager.rebuildView(
              updatedFile,
              state.files,
              allRelations
            )
            
            // Infer Type
            const inferredCol = viewSchema.find(c => c.name === metric.name)
            
            set(prev => ({
              files: prev.files.map(f =>
                f.id === fileId
                  ? {
                      ...f,
                      viewSchema, // Update View Schema
                      smartMetrics: (f.smartMetrics || []).map(m =>
                        m.id === metric.id
                          ? { ...m, type: (inferredCol?.type || 'DOUBLE') as any }
                          : m
                      ),
                    }
                  : f
              ),
            }))
          } catch (e: any) {
            console.error('Failed to sync metric type', e)
            
            // Rollback on failure
            set(prev => ({
              files: prev.files.map(f =>
                f.id === fileId
                  ? { ...f, smartMetrics: (f.smartMetrics || []).filter(m => m.id !== metric.id) }
                  : f
              )
            }))

            useToastStore.getState().addToast({
              title: 'Failed to add metric',
              description: e.message || 'SQL Syntax Error',
              type: 'error'
            })
          }
        }
      },

      updateSmartMetric: async (fileId, metricId, updates) => {
        const oldFile = get().files.find(f => f.id === fileId)
        const oldMetric = oldFile?.smartMetrics?.find(m => m.id === metricId)

        set(state => ({
          files: state.files.map(f =>
            f.id === fileId
              ? {
                  ...f,
                  smartMetrics: (f.smartMetrics || []).map(m =>
                    m.id === metricId ? { ...m, ...updates } : m
                  ),
                }
              : f
          ),
        }))

        const state = get()
        const updatedFile = state.files.find(f => f.id === fileId)

        if (updatedFile) {
          try {
            const allRelations = selectAllRelations(state)
            const viewSchema = await DuckDBViewManager.rebuildView(
              updatedFile,
              state.files,
              allRelations
            )
            set(prev => ({
              files: prev.files.map(f =>
                f.id === fileId ? { ...f, viewSchema } : f
              ),
            }))
          } catch (e: any) {
             console.error('Failed to update metric', e)
             // Rollback
             if (oldMetric) {
                set(prev => ({
                  files: prev.files.map(f =>
                    f.id === fileId
                      ? { ...f, smartMetrics: (f.smartMetrics || []).map(m => m.id === metricId ? oldMetric : m) }
                      : f
                  )
                }))
             }

             useToastStore.getState().addToast({
                title: 'Failed to update metric',
                description: e.message,
                type: 'error'
             })
          }
        }
      },

      removeSmartMetric: async (fileId, metricId) => {
        set(state => ({
          files: state.files.map(f =>
            f.id === fileId
              ? {
                  ...f,
                  smartMetrics: (f.smartMetrics || []).filter(
                    m => m.id !== metricId
                  ),
                }
              : f
          ),
        }))
        const state = get()
        const updatedFile = state.files.find(f => f.id === fileId)
        if (updatedFile) {
          const allRelations = selectAllRelations(state)
          const viewSchema = await DuckDBViewManager.rebuildView(
            updatedFile,
            state.files,
            allRelations
          )
          set(prev => ({
            files: prev.files.map(f =>
              f.id === fileId ? { ...f, viewSchema } : f
            ),
          }))
        }
      },

      markAsStale: ids =>
        set(state => ({
          files: state.files.map(f =>
            ids.includes(f.id) ? { ...f, status: 'out-of-sync' } : f
          ),
        })),

      markFileMissing: id =>
        set(state => ({
          files: state.files.map(f =>
            f.id === id ? { ...f, status: 'missing' } : f
          ),
        })),

      reloadFile: (fileId, { lastModified, newColumns }) => {
        let droppedRelationsCount = 0
        set(state => {
          const file = state.files.find(f => f.id === fileId)
          if (!file) return state

          const oldColumns = file.columns
          const mergedColumns = newColumns.map(newCol => {
            const oldCol = oldColumns.find(c => c.name === newCol.name)
            if (oldCol) {
              return {
                ...newCol,
                userType: oldCol.userType,
                semantic: oldCol.semantic,
                type: newCol.type,
              }
            } else {
              return newCol
            }
          })

          return {
            files: state.files.map(f => {
              if (f.id === fileId) {
                // 1. Update this file: Check source columns for its relations
                const validRelations = (f.relations || []).filter(r =>
                  mergedColumns.some(c => c.name === r.sourceColumn)
                )
                droppedRelationsCount +=
                  (f.relations?.length || 0) - validRelations.length

                return {
                  ...f,
                  columns: mergedColumns,
                  relations: validRelations,
                  status: 'ready',
                  lastModified,
                }
              } else {
                // 2. Update other files: Check target columns if they point to this file
                const validRelations = (f.relations || []).filter(r => {
                  if (r.targetFileId === fileId) {
                    const isValid = mergedColumns.some(
                      c => c.name === r.targetColumn
                    )
                    if (!isValid) droppedRelationsCount++
                    return isValid
                  }
                  return true
                })
                return { ...f, relations: validRelations }
              }
            }),
          }
        })
        return droppedRelationsCount
      },

      addDomainRule: content => {
        Analytics.track('domain_rule_added', { scope: 'project' })
        set(state => ({
          domainRules: [
            ...(state.domainRules || []),
            {
              id: crypto.randomUUID(),
              content,
              isEnabled: true,
              createdAt: Date.now(),
            },
          ],
        }))
      },

      toggleDomainRule: id =>
        set(state => ({
          domainRules: (state.domainRules || []).map(r =>
            r.id === id ? { ...r, isEnabled: !r.isEnabled } : r
          ),
        })),

      removeDomainRule: id =>
        set(state => ({
          domainRules: (state.domainRules || []).filter(r => r.id !== id),
        })),

      updateDomainRule: (id, content) =>
        set(state => ({
          domainRules: (state.domainRules || []).map(r =>
            r.id === id ? { ...r, content } : r
          ),
        })),

      reorderDomainRules: (oldIndex, newIndex) =>
        set(state => {
          const newRules = [...(state.domainRules || [])]
          const [removed] = newRules.splice(oldIndex, 1)
          newRules.splice(newIndex, 0, removed)
          return { domainRules: newRules }
        }),

      replaceFile: async (
        fileId: string,
        newPath: string,
        force: boolean = false
      ) => {
        const file = get().files.find(f => f.id === fileId)

        if (!file) {
          console.error(
            `replaceFile: File ${fileId} not found in project store`
          )
          return 'error'
        }

        // [REFACTOR] Only support local file replacement for now
        if (file.source.type !== 'local_file') {
          console.error('replaceFile: Only local files can be replaced')
          return 'error'
        }

        try {
          // Optimistic update status
          set(state => ({
            files: state.files.map(f =>
              f.id === fileId ? { ...f, status: 'processing' } : f
            ),
          }))

          if (!force) {
            // 1. Peek New Schema (Validation)
            const parseRes = await window.electronAPI.parseFile(newPath)
            if (
              !parseRes.success ||
              !parseRes.data ||
              parseRes.data.length === 0
            ) {
              throw new Error(
                parseRes.error || 'Failed to parse new file for validation'
              )
            }

            // Find best matching sheet/table from the parsed result
            let candidate = parseRes.data[0]
            const sheetName = file.source.subResource
            if (sheetName) {
              // Try to find the same sheet name
              const match = parseRes.data.find(
                (d: any) => d.sheetName === sheetName
              )
              if (match) candidate = match
            }

            const newColNames = new Set(
              candidate.schema.columns.map((c: any) => c.name)
            )
            const oldColNames = file.columns.map(c => c.name)
            const missing = oldColNames.filter(c => !newColNames.has(c))

            // Clean up temporary tables created by parseFile
            for (const item of parseRes.data) {
              await window.electronAPI.deleteTable(item.tableName)
            }

            // User Confirmation if Schema Mismatch
            if (missing.length > 0) {
              set({
                pendingReplace: {
                  fileId,
                  newPath,
                  missing,
                },
              })
              // Revert status to ready
              set(state => ({
                files: state.files.map(f =>
                  f.id === fileId ? { ...f, status: 'ready' } : f
                ),
              }))
              return 'pending'
            }
          }

          // 2. Trigger Backend Re-ingest
          const result = await window.electronAPI.reIngestFile({
            fileId,
            filePath: newPath,
            tableName: file.tableName,
            sheetName: file.source.subResource,
            columns: file.columns,
            readOptions: file.source.readOptions, // Pass saved read options (e.g. encoding)
          })

          if (!result.success || !result.data) {
            throw new Error(result.error || 'Re-ingest failed')
          }

          const { lastModified, newColumns } = result.data

          // 3. Fetch new row count
          let rowCount = 0
          try {
            const countRes = await window.electronAPI.runSQL(
              `SELECT COUNT(*) as c FROM "${file.tableName}" `
            )
            if (
              countRes.success &&
              countRes.data &&
              countRes.data.data.length > 0
            ) {
              const c = countRes.data.data[0].c
              rowCount = typeof c === 'bigint' ? Number(c) : Number(c)
            }
          } catch (e) {
            console.warn('Failed to fetch row count after replace', e)
          }

          // 4. Update Store (Merge Logic from reloadFile)
          get().reloadFile(fileId, { lastModified, newColumns })

          set(state => ({
            files: state.files.map(f =>
              f.id === fileId
                ? {
                    ...f,
                    // [REFACTOR] Update path in source object
                    source: {
                      ...f.source,
                      path: newPath,
                    },
                    rowCount: rowCount,
                    status: 'ready',
                    error: undefined,
                  }
                : f
            ),
          }))

          // [V1.7] Rebuild View to ensure Sidecar & Metrics are synced
          const updatedState = get()
          const updatedFile = updatedState.files.find(f => f.id === fileId)
          if (updatedFile) {
            const relations = selectAllRelations(updatedState)
            await DuckDBViewManager.rebuildView(updatedFile, updatedState.files, relations)
          }

          return 'completed'
        } catch (error: any) {
          console.error('replaceFile failed', error)
          const errorMessage = error.message || 'Failed to replace file'

          set(state => ({
            files: state.files.map(f =>
              f.id === fileId
                ? { ...f, status: 'error', error: errorMessage }
                : f
            ),
          }))
          return 'error'
        }
      },

      loadProject: (data: ProjectData) => {
        // Explicitly exclude transient UI states that shouldn't be loaded from file
        const { editingReportId: _er, ...rest } = data as any
        set({ ...rest, isProjectLoaded: true, editingReportId: null })
      },

      cleanupZombieFiles: () =>
        set(state => ({
          files: state.files.map(f =>
            f.status === 'uploading' || f.status === 'processing'
              ? {
                  ...f,
                  status: 'error',
                  error: 'App closed unexpectedly during processing',
                }
              : f
          ),
        })),

      refreshFileMetadata: async fileId => {
        const state = get()
        const file = state.files.find(f => f.id === fileId)
        if (!file) return

        try {
          // 1. Fetch sidecar info first to identify AI columns authoritatively
          const sidecarName = getSidecarTableName(file.tableName)
          const sidecarRes = await window.electronAPI.runSQL(`PRAGMA table_info("${sidecarName}")`)
          const aiColumnNames = new Set<string>()
          if (sidecarRes.success && sidecarRes.data) {
             sidecarRes.data.data.forEach((c: any) => {
                if (c.name !== '_ws_row_id') aiColumnNames.add(c.name)
             })
          }

          // 2. Rebuild View First to ensure sidecar columns are linked
          const allRelations = selectAllRelations(state)
          await DuckDBViewManager.rebuildView(file, state.files, allRelations)

          const viewName = getLogicalViewName(file.tableName)

          // 3. Fetch columns from the LOGICAL VIEW (True Schema)
          const sqlRes = await window.electronAPI.runSQL(`PRAGMA table_info("${viewName}")`)
          if (!sqlRes.success || !sqlRes.data) throw new Error(sqlRes.error || 'Failed to fetch view info')
          
          const rawColumns = sqlRes.data.data.map((c: any) => ({
            name: c.name,
            type: normalizeDuckDBType(c.type),
            safeName: c.name,
            sampleValues: [],
            isPrimaryKey: c.pk === 1,
            sourceType: 'raw' // Default
          }))

          // 4. Fetch Samples
          const sampleRes = await window.electronAPI.runSQL(`SELECT * FROM "${viewName}" LIMIT 5`)
          const sampleRows = sampleRes.success && sampleRes.data ? sampleRes.data.data : []

          // 5. Merge and Update
          const mergedColumns = rawColumns.map((newCol: any) => {
             const oldCol = file.columns.find(c => c.name === newCol.name)
             const samples = sampleRows.map(r => r[newCol.name]).filter(v => v !== null && v !== undefined)

             // AUTHORITATIVE IDENTIFICATION: 
             let sourceType: import('@shared/types').ColumnSourceType = oldCol?.sourceType || 'raw'
             const metricDef = file.smartMetrics?.find(m => m.name === newCol.name)
             
             if (aiColumnNames.has(newCol.name)) {
                sourceType = 'ai'
             } else if (metricDef) {
                sourceType = 'metric'
             } else if (newCol.name.includes('__')) {
                sourceType = 'joined'
             }

             // Merge Semantic
             let semantic = oldCol?.semantic
             if (sourceType === 'metric' && metricDef?.description) {
                // Keep existing semantic fields (aliases, etc.) but update description from definition
                semantic = { 
                  ...(semantic || { isVisibleToAI: true }), 
                  description: metricDef.description 
                }
             }

             if (oldCol) {
                return {
                   ...newCol,
                   sampleValues: samples.length > 0 ? samples : oldCol.sampleValues,
                   userType: oldCol.userType,
                   semantic,
                   sourceType
                }
             }
             return { ...newCol, sampleValues: samples, sourceType, semantic }
          })

          // 6. Update FileNode
          set(prev => ({
            files: prev.files.map(f => f.id === fileId ? { 
              ...f, 
              columns: mergedColumns, 
              lastModified: Date.now(),
              viewSchema: mergedColumns 
            } : f)
          }))

          useToastStore.getState().addToast({
            title: 'Metadata Synced',
            type: 'success'
          })
        } catch (e: any) {
          console.error('refreshFileMetadata failed', e)
        }
      },

      reset: () => set(initialProjectState),

      closeProject: async () => {
        try {
          await window.electronAPI.projectClose()
        } catch (e) {
          console.error('Failed to close project on backend', e)
        }
        set({
          ...initialProjectState,
          currentProjectPath: null,
          isProjectLoaded: false,
          isRestoring: false,
        })
      },

      saveTableView: (fileId, view) =>
        set(state => {
          const currentViews = (state.tableViews || {})[fileId] || []
          const exists = currentViews.find(v => v.id === view.id)
          const nextViews = exists 
            ? currentViews.map(v => v.id === view.id ? view : v)
            : [...currentViews, view]
          
          return {
            tableViews: {
              ...(state.tableViews || {}),
              [fileId]: nextViews
            }
          }
        }),

      deleteTableView: (fileId, viewId) =>
        set(state => ({
          tableViews: {
            ...(state.tableViews || {}),
            [fileId]: ((state.tableViews || {})[fileId] || []).filter(v => v.id !== viewId)
          }
        })),

      updateTableView: (fileId, viewId, updates) =>
        set(state => ({
          tableViews: {
            ...(state.tableViews || {}),
            [fileId]: ((state.tableViews || {})[fileId] || []).map(v => 
              v.id === viewId ? { ...v, ...updates } : v
            )
          }
        })),
    }),
    {
      name: 'wansan-project-v2',
      storage: createBigIntStorage(),
      partialize: state => {
        // Only persist navigation preferences.
        // Core data (files, sessions, widgets) MUST be loaded from disk (SSOT).
        return {
          currentProjectPath: state.currentProjectPath,
          activeSessionId: state.activeSessionId,
          sidebarMode: state.sidebarMode,
          activeView: state.activeView,
          appMode: state.appMode,
        } as unknown as ProjectState
      },
      merge: (persistedState: any, currentState) => {
        // Force transient fields to null/default even if they exist in storage
        return {
          ...currentState,
          ...(persistedState as object),
          editingReportId: null, // ALWAYS start with no editor
          isProjectLoaded: false,
          isRestoring: false,
          isRefreshing: false,
          smartFilterRequest: null,
          analysisReviewResult: null,
          isSmartModelingOpen: false,
          pendingReplace: null,
        }
      },
      onRehydrateStorage: () => state => {
        if (state) {
          // Ensure transient UI states are reset on reload
          state.editingReportId = null
          state.smartFilterRequest = null
          state.analysisReviewResult = null
          state.isSmartModelingOpen = false
          state.pendingReplace = null
          state.showRefreshConfirm = false
          state.isRestoring = false
          state.isRefreshing = false
          state.isProjectLoaded = false // Force reload from disk
        }
      },
    }
  )
)

export const selectAllRelations = (state: ProjectState) => {
  return state.files.flatMap(f =>
    (f.relations || []).map(r => ({
      id: r.id,
      fileAId: f.id,
      columnA: r.sourceColumn,
      fileBId: r.targetFileId,
      columnB: r.targetColumn,
      autoDetected: r.autoDetected,
    }))
  )
}

export const selectTableViewsForFile = (state: ProjectState, fileId: string) =>
  (state.tableViews || {})[fileId] || []

export const selectViewById = (
  state: ProjectState,
  fileId: string,
  viewId: string | null
) => {
  if (!viewId) return null
  return selectTableViewsForFile(state, fileId).find(v => v.id === viewId) || null
}

export const calculateExplorerDirty = (
  activeView: import('@shared/types/project').TableView | null,
  filterApplied: import('@shared/types/filter').FilterState,
  sorting: Array<{ id: string; desc: boolean }>,
  columnVisibility: Record<string, boolean>,
  columnOrder: string[],
  defaultColumnOrder: string[]
) => {
  if (!activeView) {
    const defaultFilters: import('@shared/types/filter').FilterState = {
      conjunction: 'AND',
      conditions: [],
    }
    return (
      JSON.stringify(filterApplied) !== JSON.stringify(defaultFilters) ||
      JSON.stringify(sorting) !== JSON.stringify([]) ||
      JSON.stringify(columnVisibility) !== JSON.stringify({}) ||
      JSON.stringify(columnOrder) !== JSON.stringify(defaultColumnOrder)
    )
  }

  const normalizedFilters = Array.isArray(activeView.filters)
    ? { conjunction: 'AND' as const, conditions: activeView.filters }
    : activeView.filters
  const normalizedVisibility: Record<string, boolean> = {}
  activeView.columnConfig?.hidden?.forEach(col => {
    normalizedVisibility[col] = false
  })

  return (
    JSON.stringify(filterApplied) !== JSON.stringify(normalizedFilters) ||
    JSON.stringify(sorting) !== JSON.stringify(activeView.sort || []) ||
    JSON.stringify(columnVisibility) !== JSON.stringify(normalizedVisibility) ||
    JSON.stringify(columnOrder) !==
      JSON.stringify(activeView.columnConfig?.order || defaultColumnOrder)
  )
}

export const resolveExplorerViewMode = (
  hasActiveView: boolean,
  dirty: boolean,
  partiallyInvalid: boolean
): import('@shared/types/project').ExplorerViewMode => {
  if (partiallyInvalid) return 'partially_invalid'
  if (!hasActiveView && !dirty) return 'default_clean'
  if (hasActiveView && !dirty) return 'saved_clean'
  if (hasActiveView && dirty) return 'saved_dirty'
  return 'unsaved_custom'
}
