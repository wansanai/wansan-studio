import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarWidth: number // Percentage of sidebar width (e.g. 20)
  analysisSplit: number[] // [chat, dashboard]
  dataSplit: number[] // [schema, grid]
  analysisLayoutMode: 'chat' | 'split' | 'board' // [NEW] Control analysis layout
  isPresentationMode: boolean // [NEW] Window fullscreen state
  migrationState: {
    isMigrating: boolean
    progress: number
    total: number
    message: string
  }
  errorModal: {
    isOpen: boolean
    title: string
    message: string
    details?: string
  }
  setSidebarWidth: (width: number) => void
  setAnalysisSplit: (layout: number[]) => void
  setDataSplit: (layout: number[]) => void
  setAnalysisLayoutMode: (mode: 'chat' | 'split' | 'board') => void // [NEW]
  setPresentationMode: (val: boolean) => void // [NEW]
  setMigrationState: (state: Partial<UIState['migrationState']>) => void
  showError: (title: string, message: string, details?: string) => void
  closeError: () => void
  resetLayout: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarWidth: 20,
      analysisSplit: [40, 60],
      dataSplit: [40, 60],
      analysisLayoutMode: 'split',
      isPresentationMode: false,
      migrationState: {
        isMigrating: false,
        progress: 0,
        total: 0,
        message: '',
      },
      errorModal: {
        isOpen: false,
        title: '',
        message: '',
      },
      setSidebarWidth: width => set({ sidebarWidth: width }),
      setAnalysisSplit: layout => set({ analysisSplit: layout }),
      setDataSplit: layout => set({ dataSplit: layout }),
      setAnalysisLayoutMode: mode => set({ analysisLayoutMode: mode }),
      setPresentationMode: val => set({ isPresentationMode: val }),
      setMigrationState: state =>
        set(prev => ({ migrationState: { ...prev.migrationState, ...state } })),
      showError: (title, message, details) =>
        set({ errorModal: { isOpen: true, title, message, details } }),
      closeError: () =>
        set({ errorModal: { ...get().errorModal, isOpen: false } }),
      resetLayout: () =>
        set({
          sidebarWidth: 20,
          analysisSplit: [40, 60],
          dataSplit: [40, 60],
          analysisLayoutMode: 'split',
        }),
    }),
    {
      name: 'wansan-ui-state-v2', // [BREAKING] Fresh state for v1.7 layout
    }
  )
)
