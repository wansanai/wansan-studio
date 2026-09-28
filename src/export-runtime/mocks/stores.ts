import { create } from 'zustand'

interface CanvasConfig {
  zoom: number
  layout: string
  title: string
}

interface WorkbenchStoreState {
  canvasConfig: CanvasConfig
  pageCount: number
  layoutScenario: string
  pinnedReports: unknown[]
  setCanvasConfig: (updates: Partial<CanvasConfig>) => void
  setPageCount: (count: number) => void
  setLayoutScenario: (scenario: string) => void
  pinReport: () => void
  removeReport: () => void
  updateReportTitle: () => void
  updateReportConfig: () => void
  updateLayout: () => void
  updateGlobalLayout: () => void
  moveWidgetToPage: () => void
  incrementPageCount: () => void
  setEditingReportId: () => void
  reset: () => void
}

export const useWorkbenchStore = create<WorkbenchStoreState>(set => ({
  canvasConfig: { zoom: 100, layout: 'a4', title: 'Report' },
  pageCount: 1,
  layoutScenario: 'default',
  pinnedReports: [],
  setCanvasConfig: updates =>
    set(state => ({
      canvasConfig: { ...state.canvasConfig, ...updates },
    })),
  setPageCount: count => set({ pageCount: count }),
  setLayoutScenario: scenario => set({ layoutScenario: scenario }),
  pinReport: () => {},
  removeReport: () => {},
  updateReportTitle: () => {},
  updateReportConfig: () => {},
  updateLayout: () => {},
  updateGlobalLayout: () => {},
  moveWidgetToPage: () => {},
  incrementPageCount: () => {},
  setEditingReportId: () => {},
  reset: () => {},
}))

interface ProjectStoreState {
  widgetRegistry: Record<string, unknown>
  files: unknown[]
  sessions: unknown[]
  domainRules: unknown[]
  updateWidget: () => void
}

export const useProjectStore = create<ProjectStoreState>(() => ({
  widgetRegistry: {},
  files: [],
  sessions: [],
  domainRules: [],
  updateWidget: () => {},
}))

interface UIStoreState {
  contentLayout: string
  sidebarLayout: string
}

export const useUIStore = create<UIStoreState>(() => ({
  contentLayout: 'vertical',
  sidebarLayout: 'visible',
}))

interface ChatStoreState {
  messages: unknown[]
  sendMessage: () => void
  setReplyTo: () => void
}

export const useChatStore = create<ChatStoreState>(() => ({
  messages: [],
  sendMessage: () => {},
  setReplyTo: () => {},
}))

interface SettingsStoreState {
  language: 'en' | 'zh'
  isActivated: boolean
}

export const useSettingsStore = create<SettingsStoreState>(() => ({
  language: 'en',
  isActivated: true,
}))

interface SqlLabStoreState {
  session: unknown | null
  open: () => void
  close: () => void
}

export const useSqlLabStore = create<SqlLabStoreState>(() => ({
  session: null,
  open: () => {},
  close: () => {},
}))

interface ToastStoreState {
  addToast: () => void
}

export const useToastStore = create<ToastStoreState>(() => ({
  addToast: () => {},
}))
