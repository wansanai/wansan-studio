import { dialog, app } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import { isDev } from '../utils/env'

type ExportRuntimeSnapshot = {
  workbench?: Record<string, unknown>
  project?: Record<string, unknown>
  ui?: Record<string, unknown>
  settings?: Record<string, unknown>
}

export async function exportWebReport(
  _aiService: unknown,
  widgets: unknown[],
  config: { title: string; theme: string; language?: 'en' | 'zh' },
  fullSnapshot?: ExportRuntimeSnapshot
) {
  const { title: reportTitle, language = 'en' } = config

  // 1. Locate Template
  let templatePath = ''
  if (isDev()) {
    templatePath = path.join(process.cwd(), 'dist/export/index.html')
  } else {
    templatePath = path.join(process.resourcesPath, 'export', 'index.html')
  }

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Export template not found at ${templatePath}. Please run build:export first.`
    )
  }

  let html = await fs.readFile(templatePath, 'utf-8')

  // 2. Prepare Snapshot Data
  const workbenchDefaults = {
    canvasConfig: { zoom: 100, layout: 'a4', title: reportTitle },
    pageCount: 1,
    layoutScenario: 'default',
    viewMode: 'dashboard', // Default
    pinnedReports: widgets,
  }

  const snapshot = {
    lang: language,
    meta: {
      title: reportTitle,
      generatedAt: Date.now(),
      version: app.getVersion(),
    },
    workbench: {
      ...workbenchDefaults,
      ...(fullSnapshot?.workbench || {}),
      pinnedReports: widgets, // Force widgets from args
    },
    project: {
      ...(fullSnapshot?.project || {}),
    },
    ui: {
      contentLayout: 'vertical',
      sidebarLayout: 'visible',
      ...(fullSnapshot?.ui || {}),
    },
    settings: {
      ...(fullSnapshot?.settings || {}),
    },
  }

  // 3. Inject Data
  const injection = `<script>window.__WANSAN_SNAPSHOT__ = ${JSON.stringify(snapshot)};</script>`
  html = html.replace('<!-- INJECT_SNAPSHOT -->', injection)

  // 4. Save
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export Dashboard',
    defaultPath: `${reportTitle.replace(/\s+/g, '_')}.html`,
    filters: [{ name: 'Web Page', extensions: ['html'] }],
  })

  if (filePath) {
    await fs.writeFile(filePath, html)
    return { success: true, filePath }
  }

  return { success: false, error: 'Cancelled' }
}