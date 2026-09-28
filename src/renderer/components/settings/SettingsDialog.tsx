import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Bot,
  BrainCircuit,
  Bug,
  CheckCircle2,
  Coins,
  Key,
  Settings2,
  Sparkles,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useToastStore } from '@/stores/useToastStore'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import { AI_PROVIDERS, type AIProviderKey } from '@/src/lib/constants'
import { exportDebugLog } from '../../utils/debug-exporter'
import { DISCLAIMER_TEXT_EN, DISCLAIMER_TEXT_ZH } from '../../lib/legal-text'
import { SimpleMarkdown } from '@/components/ui/simple-markdown'
import { DomainKnowledgeTab } from './domain-knowledge-tab'
import { TokenAuditTab } from './TokenAuditTab'

type VerifyStatus = 'idle' | 'loading' | 'success' | 'error'

type SettingsDialogProps = Record<string, never>

export function SettingsDialog(_props: SettingsDialogProps) {
  const settings = useSettingsStore()
  const addToast = useToastStore(state => state.addToast)
  const { t, i18n } = useTranslation('settings')
  const { t: tCommon } = useTranslation('common')

  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle')
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('ai')
  const [licenseCode, setLicenseCode] = useState('')

  const disclaimerText = i18n.language.startsWith('zh')
    ? DISCLAIMER_TEXT_ZH
    : DISCLAIMER_TEXT_EN

  const activeProviders = useMemo(() => {
    const remoteProviders = settings.remoteConfig?.providers
    return remoteProviders
      ? { ...AI_PROVIDERS, ...remoteProviders }
      : AI_PROVIDERS
  }, [settings.remoteConfig])

  useEffect(() => {
    if (settings.language && i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language)
    }
  }, [settings.language, i18n])

  useEffect(() => {
    const handleOpenSettings = (e: Event) => {
      setIsOpen(true)
      const detail = (e as CustomEvent).detail
      if (detail && typeof detail === 'string') {
        setActiveTab(detail)
      } else {
        setActiveTab('ai')
      }
    }
    document.addEventListener('open-settings', handleOpenSettings)

    return () => {
      document.removeEventListener('open-settings', handleOpenSettings)
    }
  }, [])

  const providerConfig =
    activeProviders[settings.provider] || activeProviders['openai']
  const modelOptions = useMemo(() => {
    // If managed by Enterprise (Special Channel), use the models provided by the backend
    if (
      settings.isSpecialChannel &&
      settings.remoteConfig?.managedAI?.models?.length
    ) {
      return settings.remoteConfig.managedAI.models as string[]
    }
    return (providerConfig?.models || []) as string[]
  }, [
    providerConfig,
    settings.isSpecialChannel,
    settings.remoteConfig?.managedAI,
  ])

  useEffect(() => {
    const options = modelOptions as string[]
    if (
      settings.isSpecialChannel &&
      options.length > 0 &&
      !options.includes(settings.model)
    ) {
      settings.updateSettings({ model: options[0] })
    }
  }, [settings.isSpecialChannel, modelOptions, settings.model, settings])

  const providerLabel = useMemo(() => {
    const config = activeProviders[settings.provider]
    return config ? config.name : settings.provider
  }, [settings.provider, activeProviders])

  const verifyConnection = useCallback(async () => {
    if (!settings.isSpecialChannel) {
      if (!settings.apiKey.trim()) {
        setVerifyStatus('error')
        setVerifyMessage(t('ai.verify_api_key_required'))
        addToast({
          title: t('ai.verify_failed_title'),
          description: t('ai.verify_failed_no_key_desc'),
          type: 'error',
          duration: 3500,
        })
        return
      }
      if (!settings.baseUrl.trim()) {
        setVerifyStatus('error')
        setVerifyMessage(t('ai.verify_base_url_required'))
        addToast({
          title: t('ai.verify_failed_title'),
          description: t('ai.verify_base_url_required'),
          type: 'error',
          duration: 3500,
        })
        return
      }
    }

    setVerifyStatus('loading')
    setVerifyMessage(null)
    try {
      const config = settings.isSpecialChannel
        ? undefined // Use existing backend config
        : {
            apiKey: settings.apiKey.trim(),
            baseURL: settings.baseUrl.trim(),
          }

      const res = await window.electronAPI.verifyAIConnection(config)

      if (!res.success) {
        setVerifyStatus('error')
        setVerifyMessage(res.error || 'Verification failed')
        addToast({
          title: t('ai.verify_failed_title'),
          description: res.error || 'Verification failed',
          type: 'error',
          duration: 4000,
        })
        return
      }

      setVerifyStatus('success')
      setVerifyMessage(t('ai.verify_connected'))
      addToast({
        title: t('ai.verify_connected_to_openai_title'),
        description: t('ai.verify_connected_to_openai_desc'),
        type: 'success',
        duration: 3000,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('ai.verify_network_error')
      setVerifyStatus('error')
      setVerifyMessage(message)
      addToast({
        title: t('ai.verify_failed_title'),
        description: message,
        type: 'error',
        duration: 4000,
      })
    }
  }, [addToast, settings, t])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 overflow-hidden border-none shadow-2xl flex flex-col bg-white">
        <DialogHeader className="hidden">
          <DialogTitle>{t('settings.title')}</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="px-6 pt-12 shrink-0">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="ai" className="flex gap-2">
                <Sparkles className="w-4 h-4" /> {t('tabs.ai')}
              </TabsTrigger>
              <TabsTrigger value="domain" className="flex gap-2">
                <BrainCircuit className="w-4 h-4" /> {t('tabs.domain')}
              </TabsTrigger>
              <TabsTrigger value="audit" className="flex gap-2">
                <Coins className="w-4 h-4" /> {t('tabs.audit')}
              </TabsTrigger>
              <TabsTrigger value="general" className="flex gap-2">
                <Settings2 className="w-4 h-4" /> {t('tabs.general')}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB: AI */}
          <TabsContent value="ai" className="flex-1 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-8">
              {/* SECTION 1: AI ENGINE */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    {t('settings.section_ai')}
                  </h4>
                  {settings.isActivated && settings.isSpecialChannel && (
                    <div className="px-2 py-1 rounded bg-zinc-900 text-white dark:bg-white dark:text-black text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                      <Sparkles className="w-3 h-3 fill-current" />

                      <span>{t('ai.managed_mode', 'Enterprise Managed')}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {!settings.isSpecialChannel && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('ai.provider_label')}
                      </label>
                      <Select
                        value={settings.provider}
                        onValueChange={value =>
                          settings.setProvider(value as AIProviderKey)
                        }
                      >
                        <SelectTrigger>
                          <span className="text-sm text-zinc-700 truncate">
                            {providerLabel ||
                              t('ai.select_provider_placeholder')}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(activeProviders).map(
                            ([key, config]) => (
                              <SelectItem key={key} value={key}>
                                {config.name}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid gap-2">
                    <label className="font-medium">
                      {t('ai.api_key_label')}
                    </label>
                    <div className="relative">
                      <Input
                        type="password"
                        disabled={settings.isSpecialChannel}
                        className={cn(
                          'px-3 font-mono transition-colors',
                          'focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-zinc-900',
                          !settings.apiKey &&
                            !settings.isSpecialChannel &&
                            'border-destructive focus-visible:border-destructive'
                        )}
                        value={
                          settings.isSpecialChannel
                            ? '********************'
                            : settings.apiKey
                        }
                        onChange={e =>
                          settings.updateSettings({ apiKey: e.target.value })
                        }
                        onBlur={() => void verifyConnection()}
                        placeholder={
                          settings.isSpecialChannel
                            ? t(
                                'ai.managed_placeholder',
                                'Managed by Organization'
                              )
                            : 'sk-...'
                        }
                      />
                    </div>
                    {/* Helper Link */}
                    {providerConfig.getKeyUrl && !settings.isSpecialChannel ? (
                      <div className="text-xs text-muted-foreground">
                        {t('ai.get_key_hint_new')}{' '}
                        <a
                          href={providerConfig.getKeyUrl}
                          onClick={e => {
                            e.preventDefault()
                            const url = providerConfig.getKeyUrl
                            if (window.electronAPI?.openExternal) {
                              void window.electronAPI.openExternal(url)
                            } else {
                              window.open(url, '_blank', 'noopener,noreferrer')
                            }
                          }}
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          {t('ai.get_key_link_new')} ↗
                        </a>
                      </div>
                    ) : null}
                  </div>

                  {/* Verify Button - Keep it simple */}
                  <div className="flex items-center gap-4">
                    <Button
                      onClick={() => void verifyConnection()}
                      disabled={verifyStatus === 'loading'}
                      className="w-32"
                    >
                      {verifyStatus === 'loading'
                        ? t('ai.verifying')
                        : t('ai.verify_button')}
                    </Button>
                    {/* Error Text Separate */}
                    {verifyMessage && verifyStatus === 'error' && (
                      <span className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" /> {verifyMessage}
                      </span>
                    )}
                    {verifyMessage && verifyStatus === 'success' && (
                      <span className="text-sm text-green-700 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> {verifyMessage}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">
                        {t('ai.model_label')}
                      </label>
                      {settings.provider !== 'custom' &&
                        settings.model &&
                        !modelOptions.includes(settings.model) && (
                          <span className="text-[10px] font-bold text-destructive uppercase animate-pulse">
                            {t('ai.model_incompatible', 'Incompatible Model')}
                          </span>
                        )}
                    </div>
                    {settings.provider === 'custom' &&
                    !settings.isSpecialChannel ? (
                      <div className="space-y-1">
                        <Input
                          value={settings.model}
                          onChange={e =>
                            settings.updateSettings({ model: e.target.value })
                          }
                          className={cn(
                            'transition-colors',
                            !settings.model.trim() && 'border-destructive focus-visible:border-destructive'
                          )}
                          placeholder={t('ai.custom_model_placeholder')}
                        />
                        {!settings.model.trim() && (
                          <p className="text-[10px] text-destructive font-medium pl-1">
                            {t('ai.model_required', 'Model name is required')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Select
                          value={settings.model}
                          onValueChange={value =>
                            settings.updateSettings({ model: value })
                          }
                        >
                          <SelectTrigger 
                            disabled={settings.isSpecialChannel}
                            className={cn(
                              'transition-colors',
                              (!settings.model || !modelOptions.includes(settings.model)) && 'border-destructive focus-visible:border-destructive'
                            )}
                          >
                            <SelectValue
                              placeholder={t('ai.select_model_placeholder')}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {modelOptions.map(m => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!settings.model && (
                          <p className="text-[10px] text-destructive font-medium pl-1">
                            {t('ai.model_selection_required', 'Please select a model')}
                          </p>
                        )}
                        {settings.model && !modelOptions.includes(settings.model) && (
                          <p className="text-[10px] text-destructive font-medium pl-1">
                            {t('ai.model_not_found_hint', 'Model not in current provider list. Please re-select.')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {!settings.isSpecialChannel && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t('ai.base_url_label')}
                      </label>
                      <Input
                        value={settings.baseUrl}
                        disabled={settings.isSpecialChannel}
                        onChange={e =>
                          settings.updateSettings({ baseUrl: e.target.value })
                        }
                        placeholder="https://api.openai.com/v1"
                        readOnly={
                          settings.provider !== 'custom' &&
                          !settings.isSpecialChannel
                        }
                        className={cn(
                          (settings.provider !== 'custom' ||
                            settings.isSpecialChannel) &&
                            'bg-muted text-muted-foreground'
                        )}
                      />
                    </div>
                  )}
                </div>
              </section>
              <div className="h-10" />
            </div>
          </TabsContent>

          {/* TAB: DOMAIN KNOWLEDGE */}
          <TabsContent
            value="domain"
            className="flex-1 overflow-y-auto px-6 py-4"
          >
            <DomainKnowledgeTab />
          </TabsContent>

          {/* TAB: AUDIT */}
          <TabsContent
            value="audit"
            className="flex-1 overflow-y-auto px-6 py-4"
          >
            <TokenAuditTab />
          </TabsContent>

          {/* TAB: GENERAL */}
          <TabsContent
            value="general"
            className="flex-1 overflow-y-auto px-6 py-4"
          >
            <div className="space-y-8">
              {/* 1. LICENSE SECTION */}
              <section>
                <h4 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Key className="h-5 w-5 text-indigo-500" />
                  {t('license.title')}
                </h4>

                <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className={cn(
                        'text-xs font-mono font-bold px-2 py-1 rounded',
                        settings.isActivated
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      )}
                    >
                      {settings.isActivated
                        ? t('license.pro_active')
                        : t('license.trial_mode')}
                    </span>
                  </div>

                  {!settings.isActivated && (
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('license.enter_code_placeholder')}
                        value={licenseCode}
                        onChange={e => setLicenseCode(e.target.value)}
                        className="bg-white h-9"
                      />
                      <Button
                        size="sm"
                        onClick={async () => {
                          const success =
                            await settings.activateLicense(licenseCode)
                          if (success) {
                            addToast({
                              title: t('license.activated_success_title'),
                              type: 'success',
                            })
                          } else {
                            addToast({
                              title: t('license.invalid_code_title'),
                              type: 'error',
                            })
                          }
                        }}
                      >
                        {t('license.activate_button')}
                      </Button>
                    </div>
                  )}
                  {settings.isActivated && (
                    <p className="text-xs text-zinc-500 font-medium">
                      {t('license.thanks_msg')}
                    </p>
                  )}
                </div>
              </section>

              <Separator />

              {/* 2. PREFERENCES */}
              <section>
                <h4 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-zinc-500" />
                  {t('settings.section_app')}
                </h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t('general.language_label')}
                    </label>
                    <Select
                      value={settings.language}
                      onValueChange={value => {
                        const lang = value === 'en' ? 'en' : 'zh'
                        settings.updateSettings({ language: lang })
                      }}
                    >
                      <SelectTrigger className="bg-white">
                        <span className="text-sm text-zinc-700 truncate">
                          {settings.language === 'zh'
                            ? t('general.language_zh')
                            : t('general.language_en')}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh">
                          {t('general.language_zh')}
                        </SelectItem>
                        <SelectItem value="en">
                          {t('general.language_en')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-100">
                    <div className="space-y-0.5">
                      <label className="text-sm font-semibold text-zinc-800">
                        {t('general.chart_labels_label')}
                      </label>
                      <p className="text-xs text-zinc-500">
                        {t('general.chart_labels_desc')}
                      </p>
                    </div>
                    <Checkbox
                      checked={settings.showChartLabels}
                      onChange={e =>
                        settings.updateSettings({
                          showChartLabels: e.target.checked,
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-100">
                    <div className="space-y-0.5">
                      <label className="text-sm font-semibold text-zinc-800">
                        {t('general.suggestion_count_label')}
                      </label>
                      <p className="text-xs text-zinc-500">
                        {t('general.suggestion_count_desc')}
                      </p>
                    </div>
                    <div className="w-[100px]">
                      <Select
                        value={String(settings.suggestionCount)}
                        onValueChange={val =>
                          settings.updateSettings({
                            suggestionCount: Number(val),
                          })
                        }
                      >
                        <SelectTrigger className="h-8 bg-white border-zinc-200">
                          <SelectValue placeholder="3" />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                            <SelectItem key={num} value={String(num)}>
                              {num}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </section>

              <Separator />

              {/* 3. ABOUT */}
              <section className="text-center py-4">
                <div className="font-semibold text-sm">Wansan Studio</div>
                <div className="text-xs text-muted-foreground">
                  {t('about.beta_version', { version: __APP_VERSION__ })}
                </div>

                <div className="mt-2 text-[10px] text-zinc-400">
                  {t('about.disclaimer_prefix')}
                  <span
                    className="underline cursor-pointer hover:text-zinc-600"
                    onClick={() => setIsDisclaimerOpen(true)}
                  >
                    {t('about.disclaimer_link')}
                  </span>
                  .
                </div>

                <div className="mt-4 text-xs text-zinc-500">
                  {t('about.contact_support')}:{' '}
                  <a
                    href={`mailto:${t('about.support_email')}`}
                    className="text-indigo-600 hover:underline"
                    onClick={e => {
                      e.preventDefault()
                      if (window.electronAPI?.openExternal) {
                        void window.electronAPI.openExternal(
                          `mailto:${t('about.support_email')}`
                        )
                      } else {
                        window.open(`mailto:${t('about.support_email')}`)
                      }
                    }}
                  >
                    {t('about.support_email')}
                  </a>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const debugPath = await exportDebugLog()
                    if (debugPath && debugPath !== 'browser-download') {
                      addToast({
                        title: tCommon('debug_export_success_toast'),
                        description: debugPath,
                        type: 'success',
                        action: {
                          label: tCommon('open_folder'),
                          onClick: () =>
                            window.electronAPI.showItemInFolder(debugPath),
                        },
                      })
                    } else {
                      addToast({
                        title: tCommon('debug_export_success_toast'),
                        type: 'success',
                      })
                    }
                  }}
                  className="mt-4 gap-2"
                >
                  <Bug className="w-4 h-4" /> {t('debug_export_button')}
                </Button>
              </section>

              <div className="h-10" />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Disclaimer Dialog */}
      <Dialog open={isDisclaimerOpen} onOpenChange={setIsDisclaimerOpen}>
        <DialogContent className="max-w-[600px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('about.disclaimer_link')}</DialogTitle>
            <DialogDescription>
              {t('about.disclaimer_dialog_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 border rounded-md bg-white">
            <SimpleMarkdown content={disclaimerText} />
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
