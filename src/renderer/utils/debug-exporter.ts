import { useSettingsStore } from '../stores/useSettingsStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useChatStore } from '../stores/useChatStore'
import { useLogStore } from '../stores/useLogStore'

export async function exportDebugLog() {
  const settings = useSettingsStore.getState()
  const files = useProjectStore.getState().files

  const chats = useChatStore.getState().messages
  const logs = await useLogStore.getState().getAllLogs()

  let mainLogs: any[] = []
  const platform = window.electronAPI?.platform ?? 'unknown'
  if (window.electronAPI?.getMainLogs) {
    const resp = await window.electronAPI.getMainLogs()
    if (resp.success) {
      mainLogs = resp.data || []
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    app_info: {
      version: __APP_VERSION__,
      platform: platform,
    },
    settings: {
      provider: settings.provider,
      model: settings.model,
      baseUrl: settings.baseUrl,
      language: settings.language,
      isActivated: settings.isActivated,
      isSpecialChannel: settings.isSpecialChannel,
      showChartLabels: settings.showChartLabels,
      suggestionCount: settings.suggestionCount,
    },
    files: files.map(f => ({
      name: f.name,
      size: f.size,
      columns: f.columns.map(c => `${c.name} (${c.type})`).join(', '),
      // NO DATA ROWS
    })),
    recent_errors: chats
      .filter(m => m.status === 'error')
      .slice(-5)
      .map(m => ({
        id: m.id,
        error: m.error,
        sql: m.reportData?.sql || m.planSql,
      })),
    system_logs: logs,
    main_process_logs: mainLogs, // CRITICAL ADDITION
  }

  // Convert to String
  const content = JSON.stringify(report, null, 2)

  if (window.electronAPI?.saveFile) {
    const result = await window.electronAPI.saveFile({
      content,
      extension: 'json',
      name: `wansan-debug-${Date.now()}.json`
    })
    if (result.success && result.data) {
      return result.data as string
    }
    return null
  } else {
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wansan-debug-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    return 'browser-download'
  }
}
