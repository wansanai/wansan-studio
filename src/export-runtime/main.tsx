import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import '@/styles/globals.css'
import { useWorkbenchStore } from '@/stores/useWorkbenchStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUIStore } from '@/stores/useUIStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import './mocks/i18n'
import i18n from './mocks/i18n'

type WorkbenchSnapshot = Partial<ReturnType<typeof useWorkbenchStore.getState>>
type ProjectSnapshot = Partial<ReturnType<typeof useProjectStore.getState>>
type UISnapshot = Partial<ReturnType<typeof useUIStore.getState>>
type SettingsSnapshot = Partial<ReturnType<typeof useSettingsStore.getState>>

interface WansanSnapshot {
  workbench?: WorkbenchSnapshot
  project?: ProjectSnapshot
  ui?: UISnapshot
  settings?: SettingsSnapshot
  lang?: 'en' | 'zh'
}

interface HydratableStore<TState> {
  setState: (state: TState) => void
}

declare global {
  interface Window {
    __WANSAN_SNAPSHOT__?: WansanSnapshot
  }
}

const snapshot = window.__WANSAN_SNAPSHOT__
const workbenchStore = useWorkbenchStore as unknown as HydratableStore<WorkbenchSnapshot>
const projectStore = useProjectStore as unknown as HydratableStore<ProjectSnapshot>
const uiStore = useUIStore as unknown as HydratableStore<UISnapshot>
const settingsStore = useSettingsStore as unknown as HydratableStore<SettingsSnapshot>

if (snapshot) {
  console.log('Hydrating from snapshot...', snapshot)

  if (snapshot.lang) {
    i18n.changeLanguage(snapshot.lang)
  }

  if (snapshot.workbench) {
    workbenchStore.setState(snapshot.workbench)
  }

  if (snapshot.project) {
    projectStore.setState(snapshot.project)
  }

  if (snapshot.ui) {
    uiStore.setState(snapshot.ui)
  }

  if (snapshot.settings) {
    settingsStore.setState(snapshot.settings)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
