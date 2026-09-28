import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  AI_PROVIDERS,
  type AIProviderKey,
  DEFAULT_SPECIAL_EXPIRY,
} from '@/src/lib/constants'
import { createBigIntStorage } from '@shared/serialization.ts'
import type {
  AIConfig,
  DomainRule,
  RemoteConfig,
  AppConfig,
} from '@shared/types'
import { Analytics } from '../services/analytics'
import { ExtractTemplate } from '../lib/ai-presets'

export type SettingsLanguage = 'en' | 'zh'

export interface SettingsState {
  provider: AIProviderKey
  apiKey: string
  baseUrl: string
  model: string
  language: SettingsLanguage
  hasCompletedOnboarding: boolean
  isActivated: boolean
  deviceId?: string
  remoteConfig: AppConfig
  dismissedAnnouncementId: string | null
  ignoredUpdateVersion: string | null // [NEW]
  domainRules: DomainRule[]
  extractTemplates: ExtractTemplate[] // [NEW]
  recentProjectPaths: string[]
  dbConnections: import('@shared/types').DBConnectionConfig[]
  isSpecialChannel: boolean
  isExpired: boolean
  showChartLabels: boolean
  suggestionCount: number
  setProvider: (provider: AIProviderKey) => void
  activateLicense: (code: string) => Promise<boolean>
  loadSensitiveData: () => Promise<void>
  setRemoteConfig: (cfg: AppConfig) => void
  dismissAnnouncement: (id: string) => void
  ignoreUpdate: (version: string) => void // [NEW]
  addDomainRule: (content: string) => void
  toggleDomainRule: (id: string) => void
  removeDomainRule: (id: string) => void
  updateDomainRule: (id: string, content: string) => void
  reorderDomainRules: (oldIndex: number, newIndex: number) => void
  addExtractTemplate: (template: Omit<ExtractTemplate, 'id' | 'createdAt' | 'lastUsedAt'>) => void // [NEW]
  removeExtractTemplate: (id: string) => void // [NEW]
  useExtractTemplate: (id: string) => void // [NEW]
  importExtractTemplates: (templates: Omit<ExtractTemplate, 'id' | 'createdAt' | 'lastUsedAt'>[]) => void // [NEW]
  addRecentProject: (path: string) => void
  removeRecentProject: (path: string) => void
  addDBConnection: (
    conn: Omit<import('@shared/types').DBConnectionConfig, 'id'>,
    password?: string
  ) => Promise<string>
  removeDBConnection: (id: string) => Promise<void>
  updateDBConnection: (
    id: string,
    updates: Partial<import('@shared/types').DBConnectionConfig>,
    password?: string
  ) => Promise<void>
  updateSettings: (
    patch: Partial<
      Omit<
        SettingsState,
        | 'setProvider'
        | 'updateSettings'
        | 'completeOnboarding'
        | 'resetPreferences'
        | 'activateLicense'
        | 'loadSensitiveData'
        | 'setRemoteConfig'
        | 'dismissAnnouncement'
      >
    >
  ) => void
  completeOnboarding: () => void
  resetPreferences: () => void
}

const checkExpiry = (
  remoteConfig: RemoteConfig
): { isSpecial: boolean; isExpired: boolean; shouldActivate: boolean } => {
  const channel = remoteConfig.channel
  const isSpecial = typeof channel === 'string' && channel.length > 0

  if (!isSpecial)
    return { isSpecial: false, isExpired: false, shouldActivate: false }

  const expiryDateStr = remoteConfig.special_expiry || DEFAULT_SPECIAL_EXPIRY
  const expiryDate = new Date(expiryDateStr)
  const isExpired = new Date() > expiryDate

  return {
    isSpecial: true,
    isExpired,
    shouldActivate: !isExpired,
  }
}

const getProviderDefaults = (provider: AIProviderKey) => {
  const config = AI_PROVIDERS[provider]
  const defaultModel = config.models[0] ?? ''
  return { baseUrl: config.baseUrl, model: defaultModel }
}

const detectDefaultLanguage = (): 'en' | 'zh' => {
  const lang = navigator.language || 'en'
  return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

const initialSettingsState: Omit<
  SettingsState,
  | 'setProvider'
  | 'updateSettings'
  | 'completeOnboarding'
  | 'resetPreferences'
  | 'activateLicense'
  | 'loadSensitiveData'
  | 'setRemoteConfig'
  | 'dismissAnnouncement'
  | 'addDomainRule'
  | 'toggleDomainRule'
  | 'removeDomainRule'
  | 'updateDomainRule'
  | 'reorderDomainRules'
  | 'addRecentProject'
  | 'removeRecentProject'
  | 'addDBConnection'
  | 'removeDBConnection'
  | 'updateDBConnection'
> = {
  provider: 'deepseek',
  apiKey: '',
  ...getProviderDefaults('deepseek'),
  language: detectDefaultLanguage(),
  hasCompletedOnboarding: false,
  isActivated: false,
  remoteConfig: {},
  dismissedAnnouncementId: null,
  ignoredUpdateVersion: null,
  domainRules: [],
  extractTemplates: [], // [NEW]
  recentProjectPaths: [],
  dbConnections: [],
  isSpecialChannel: false,
  isExpired: false,
  showChartLabels: false,
  suggestionCount: 3,
  ignoreUpdate: () => {},
  addExtractTemplate: () => {},
  removeExtractTemplate: () => {},
  useExtractTemplate: () => {},
  importExtractTemplates: () => {},
}

export const SETTINGS_STORAGE_KEY = 'wansan-settings-v1'

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...initialSettingsState,
      // ... (loadSensitiveData and other actions)
      addExtractTemplate: template =>
        set(state => ({
          extractTemplates: [
            ...state.extractTemplates,
            { 
              ...template, 
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              lastUsedAt: Date.now()
            },
          ],
        })),
      removeExtractTemplate: id =>
        set(state => ({
          extractTemplates: state.extractTemplates.filter(t => t.id !== id),
        })),
      useExtractTemplate: id =>
        set(state => ({
          extractTemplates: state.extractTemplates.map(t => 
            t.id === id ? { ...t, lastUsedAt: Date.now() } : t
          ),
        })),
      importExtractTemplates: templates =>
        set(state => {
          const now = Date.now()
          // Avoid duplicates by label
          const existingLabels = new Set(
            state.extractTemplates.map(t => t.label)
          )
          const newTemplates = templates
            .filter(t => !existingLabels.has(t.label))
            .map((t, index) => ({ 
              ...t, 
              id: crypto.randomUUID(),
              createdAt: now + index, // Slight offset to maintain import order
              lastUsedAt: now + index
            }))

          return {
            extractTemplates: [...state.extractTemplates, ...newTemplates],
          }
        }),
      addDBConnection: async (conn, password) => {
        const id = crypto.randomUUID()
        const newConn = { ...conn, id }
        if (password) {
          await window.electronAPI.secureSet({ key: `db_pass_${id}`, value: password })
        }
        set(state => ({
          dbConnections: [...state.dbConnections, newConn],
        }))
        return id
      },
      removeDBConnection: async id => {
        await window.electronAPI.secureSet({ key: `db_pass_${id}`, value: '' }) // Clear password
        set(state => ({
          dbConnections: state.dbConnections.filter(c => c.id !== id),
        }))
      },
      updateDBConnection: async (id, updates, password) => {
        if (password) {
          await window.electronAPI.secureSet({ key: `db_pass_${id}`, value: password })
        }
        set(state => ({
          dbConnections: state.dbConnections.map(c =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }))
      },
      loadSensitiveData: async () => {
        try {
          // Sync full AI config from backend (Single Source of Truth)
          // Backend handles secure storage reading and masking if needed
          const res = await window.electronAPI.getAIConfig()
          if (res.success && res.data) {
            const { apiKey, baseURL, model, provider } = res.data

            // Update store only if values exist
            set(state => ({
              apiKey: apiKey || state.apiKey,
              baseUrl: baseURL || state.baseUrl,
              model: model || state.model,
              provider: (provider as AIProviderKey) || state.provider,
            }))
          }
        } catch (e) {
          console.error('Failed to sync AI config from backend', e)
        }
      },
      setProvider: provider => {
        const defaults = getProviderDefaults(provider)
        set({ provider, ...defaults })
        const currentSettings = get()
        if (currentSettings.apiKey) {
          const aiConfig: AIConfig = {
            apiKey: currentSettings.apiKey,
            baseURL: defaults.baseUrl,
            model: defaults.model,
          }
          void window.electronAPI.setAIConfig(aiConfig)
        }
      },
      activateLicense: async (code: string) => {
        const normalizedCode = code.trim().toUpperCase()
        if (!normalizedCode) return false

        try {
          // Use Main process Auth Service to validate
          const res = await window.electronAPI.validateLicense(normalizedCode)
          if (res.success && res.data) {
            set({ isActivated: true })
            Analytics.track('beta_activated', {
              code_prefix: normalizedCode.substring(0, 6),
            })
            return true
          }
        } catch (e) {
          console.error('License validation failed:', e)
        }
        return false
      },
      setRemoteConfig: (cfg: AppConfig) => {
        const { isSpecial, isExpired, shouldActivate } = checkExpiry(cfg)
        set(state => {
          let newIsActivated = state.isActivated

          if (isSpecial) {
            newIsActivated = shouldActivate
          } else if (cfg.isActivated !== undefined) {
            newIsActivated = cfg.isActivated
          }

          // Clean the payload to store only RemoteConfig part in state.remoteConfig
          const {
            isSpecialChannel: _isSpecialChannel,
            isExpired: _e,
            isOffline: _isOffline,
            betaCodes: _betaCodes,
            ...rawRemote
          } = cfg

          return {
            remoteConfig: rawRemote,
            isSpecialChannel: isSpecial,
            isExpired: isExpired,
            isActivated: newIsActivated,
          }
        })
      },
      dismissAnnouncement: (id: string) => set({ dismissedAnnouncementId: id }),
      ignoreUpdate: (version: string) => set({ ignoredUpdateVersion: version }),
      addDomainRule: content => {
        Analytics.track('domain_rule_added', { scope: 'global' })
        set(state => ({
          domainRules: [
            ...state.domainRules,
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
          domainRules: state.domainRules.map(r =>
            r.id === id ? { ...r, isEnabled: !r.isEnabled } : r
          ),
        })),
      removeDomainRule: id =>
        set(state => ({
          domainRules: state.domainRules.filter(r => r.id !== id),
        })),
      updateDomainRule: (id, content) =>
        set(state => ({
          domainRules: state.domainRules.map(r =>
            r.id === id ? { ...r, content } : r
          ),
        })),
      reorderDomainRules: (oldIndex, newIndex) =>
        set(state => {
          const newRules = [...state.domainRules]
          const [removed] = newRules.splice(oldIndex, 1)
          newRules.splice(newIndex, 0, removed)
          return { domainRules: newRules }
        }),
      addRecentProject: path =>
        set(state => {
          const filtered = (state.recentProjectPaths || []).filter(
            p => p !== path
          )
          const newList = [path, ...filtered].slice(0, 10)
          return { recentProjectPaths: newList }
        }),
      removeRecentProject: path =>
        set(state => ({
          recentProjectPaths: (state.recentProjectPaths || []).filter(
            p => p !== path
          ),
        })),
      updateSettings: patch =>
        set(state => {
          let nextState = { ...state, ...patch }
          const nextProvider = (patch as Partial<SettingsState>).provider

          if (nextProvider && nextProvider !== state.provider) {
            const defaults = getProviderDefaults(nextProvider)
            nextState = {
              ...state,
              ...patch,
              provider: nextProvider,
              ...defaults,
            }
          }

          const aiSettingsChanged =
            (patch as Partial<SettingsState>).apiKey !== undefined ||
            (patch as Partial<SettingsState>).baseUrl !== undefined ||
            (patch as Partial<SettingsState>).model !== undefined ||
            nextProvider !== undefined

          if (aiSettingsChanged && nextState.apiKey) {
            const aiConfig: AIConfig = {
              apiKey: nextState.apiKey,
              baseURL: nextState.baseUrl,
              model: nextState.model,
            }
            // 后端 AIService.setConfig 会负责写入 secure-storage
            void window.electronAPI.setAIConfig(aiConfig)
          }

          return nextState
        }),
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      resetPreferences: () => {
        set(state => ({
          language: detectDefaultLanguage(),
          isActivated: state.isActivated,
          apiKey: state.apiKey,
          deviceId: state.deviceId,
          remoteConfig: state.remoteConfig,
          provider: state.provider,
          baseUrl: state.baseUrl,
          model: state.model,
          dismissedAnnouncementId: state.dismissedAnnouncementId,
          ignoredUpdateVersion: state.ignoredUpdateVersion,
          showChartLabels: false,
          suggestionCount: 3,
        }))
      },
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createBigIntStorage(),
      version: 3,
      partialize: state => {
        // [SECURITY] Explicitly exclude sensitive data and transient flags
        const {
          apiKey: _apiKey,
          isSpecialChannel: _isSpecialChannel,
          isExpired: _isExpired,
          remoteConfig,
          ...rest
        } = state

        // Deep clean remoteConfig to remove sensitive security fields from localStorage
        // but keep providers and announcements for offline UX
        const {
          special_expiry: _special_expiry,
          channel: _channel,
          beta_code: _beta_code,
          ...safeRemoteConfig
        } = remoteConfig || {}

        return {
          ...rest,
          remoteConfig: safeRemoteConfig as AppConfig,
        } as unknown as SettingsState
      },

      migrate: persistedState => {
        const state = persistedState as Partial<SettingsState> | undefined
        if (!state) return initialSettingsState as any

        const provider = (state.provider ?? 'deepseek') as AIProviderKey
        const defaults = getProviderDefaults(provider)
        const remoteConfig = state.remoteConfig ?? {}
        const { isSpecial, isExpired, shouldActivate } =
          checkExpiry(remoteConfig)

        const baseUrl = state.baseUrl ?? defaults.baseUrl
        const model = state.model ?? defaults.model

        // [MIGRATION V1.2 -> V1.3]
        // If we are upgrading, sync the legacy frontend config to the new backend store
        // This ensures users don't lose their custom model/baseUrl settings
        if (baseUrl || model) {
          console.log('[Migration] Syncing legacy AI config to backend...')
          void window.electronAPI.setAIConfig({
            baseURL: baseUrl,
            model: model,
          })
        }

        return {
          ...initialSettingsState,
          ...state,
          provider,
          baseUrl,
          model,
          isActivated: shouldActivate || (state.isActivated ?? false),
          remoteConfig,
          isSpecialChannel: isSpecial,
          isExpired: isExpired,
          dismissedAnnouncementId: state.dismissedAnnouncementId ?? null,
          ignoredUpdateVersion: state.ignoredUpdateVersion ?? null,
        } as any
      },
    }
  )
)
