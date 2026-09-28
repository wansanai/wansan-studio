import { dialog, BrowserWindow, shell, app } from 'electron'
import { registerHandler } from '../utils/ipc-helper'
import { NativeDatabaseService } from './native-db-service'
import { FileService } from './file'
import { AIService } from './ai-service'
import { getDeviceId } from './device'
import { secureSet, secureGet, secureClear } from './secure-storage'
import { executeSQL } from '../engine/executor'
import { ingestJsonData, getUniqueTableName } from '../engine/ingestion'
import { exportWebReport } from './web-export'
import { exportExcel } from './excel-export'
import fs from 'fs-extra'
import os from 'os'
import Store from 'electron-store'
import { authService } from './auth-service'
import { getMainLogs } from '../utils/logger'
import { getSidecarTableName } from '@shared/naming-utils'

import { ProjectManager } from './project-manager'
import { tokenManager } from './token-manager'

type AppPathName = Parameters<typeof app.getPath>[0]

type FileProgressInfo = {
  rowCount?: number
  isPercentage?: boolean
  progress?: number
}

type ExportReportPayload = {
  type?: string
  title?: string
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function setupIPC(
  databaseService: NativeDatabaseService,
  aiService: AIService,
  connectorService: import('./connector-service').DBConnectorService,
  projectManager: ProjectManager
) {
  const fileService = new FileService(databaseService)

  // --- Domain: Audit ---
  registerHandler('audit.getTokenConfig', async () => {
    return { success: true, data: tokenManager.getBudgetConfig() }
  })

  registerHandler('audit.setTokenConfig', async (_, config) => {
    tokenManager.setBudgetConfig(config)
    return { success: true }
  })

  registerHandler('audit.getTokenUsage', async () => {
    const tokens = tokenManager.getDailyTokens()
    const total = tokenManager.getTotalUsage()
    return {
      success: true,
      data: {
        dailyUsageUSD: tokenManager.getDailyUsage(),
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        totalUsage: total
      }
    }
  })

  // --- Domain: Database Connectors ---
  registerHandler('db.testDBConnection', async (_event, { config, password }) => {
    const success = await connectorService.testConnection(config, password)
    return { success: true, data: success }
  })

  registerHandler('db.listDBTables', async (_event, config) => {
    const tables = await connectorService.listTables(config)
    return { success: true, data: tables }
  })

  registerHandler('db.syncDBTable', async (_event, { config, tableName }) => {
    const result = await connectorService.syncTable(config, tableName)
    return { success: true, data: result }
  })

  // --- Domain: System (Sys) ---
  registerHandler('sys.openExternal', async (_event, url) => {
    if (typeof url !== 'string' || !url.trim()) return { success: false, error: 'Invalid URL' }
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { success: false, error: 'Unsupported URL protocol' }
    await shell.openExternal(parsed.toString())
    return { success: true }
  })

  registerHandler('sys.showItemInFolder', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath.trim()) return { success: false, error: 'Invalid file path' }
    if (!fs.existsSync(filePath)) return { success: false, error: 'File does not exist' }
    shell.showItemInFolder(filePath)
    return { success: true }
  })

  registerHandler('sys.getDeviceId', async () => {
    const id = await getDeviceId()
    return { success: true, data: id }
  })

  registerHandler('sys.secureSet', async (_event, { key, value }) => {
    const success = secureSet(key, value)
    return { success, data: success }
  })

  registerHandler('sys.secureGet', async (_event, key) => {
    const value = secureGet(key)
    return { success: true, data: value }
  })

  registerHandler('sys.validateLicense', async (_event, key) => {
    const isValid = await authService.validateKeyLocally(key)
    return { success: true, data: isValid }
  })

  registerHandler('sys.getUserInfo', async () => {
    const userInfo = os.userInfo()
    return { success: true, data: { username: userInfo.username } }
  })

  registerHandler('sys.getPath', async (_event, name) => {
    return { success: true, data: app.getPath(name as AppPathName) }
  })

  registerHandler('sys.getAppVersion', async () => {
    return { success: true, data: app.getVersion() }
  })

  registerHandler('sys.getMainLogs', async () => {
    return { success: true, data: getMainLogs() }
  })

  // --- Domain: File Operations ---
  registerHandler('file.parseFile', async (event, filePath) => {
    const onProgress = (info: FileProgressInfo) => {
      event.sender.send('file:parse-progress', {
        filePath,
        count: info.rowCount,
        isPercentage: info.isPercentage,
        progress: info.progress,
      })
    }
    const result = await fileService.parseFile(filePath, onProgress)
    return { success: true, data: result }
  })

  registerHandler('file.inspectFile', async (_, filePath) => {
    const result = await fileService.inspectFile(filePath)
    return { success: true, data: result }
  })

  registerHandler('file.prepareFile', async (_, { filePath, sourceName, readOptions }) => {
    const result = await fileService.prepareFile(filePath, sourceName, readOptions)
    return { success: true, data: result }
  })

  registerHandler('file.selectFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Data Files', extensions: ['xlsx', 'xls', 'csv', 'json', 'parquet'] }],
    })
    if (result.canceled) return { success: false, error: 'User cancelled' }
    return { success: true, data: result.filePaths[0] }
  })

  registerHandler('file.selectFiles', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Data Files', extensions: ['xlsx', 'xls', 'csv', 'json', 'parquet'] }],
    })
    if (result.canceled) return { success: false, error: 'User cancelled' }
    const stats = await Promise.all(result.filePaths.map(async p => {
      const s = await fs.stat(p)
      return { path: p, size: s.size }
    }))
    return { success: true, data: stats }
  })

  registerHandler('file.selectDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Select Folder' })
    if (result.canceled) return { success: false, error: 'User cancelled' }
    return { success: true, data: result.filePaths[0] }
  })

  registerHandler('file.getUniqueTableName', async (_event, { name, sheetName }) => {
    const result = await getUniqueTableName(databaseService, name, sheetName)
    return { success: true, data: result }
  })

  registerHandler('file.validateColumnTypes', async (_event, params) => {
    const result = await fileService.validateColumnTypes(params)
    return { success: true, data: result }
  })

  registerHandler('file.reIngestFile', async (event, { fileId, filePath, tableName, sheetName, columns, readOptions }) => {
    const onProgress = (info: FileProgressInfo) => {
      event.sender.send('file:progress', { fileId, progress: info.rowCount, isPercentage: info.isPercentage, percentage: info.progress })
    }
    const result = await fileService.reIngestFile(filePath, tableName, sheetName, onProgress, columns, readOptions)
    return { success: true, data: result }
  })

  // --- Domain: Ingestion ---
  registerHandler('ingest.ingestPreCheck', async (_event, params) => {
    const result = await fileService.ingestPreCheck(params)
    return { success: true, data: result }
  })

  registerHandler('ingest.appendData', async (_event, params) => {
    const result = await fileService.appendData(params)
    return { success: true, data: result }
  })

  registerHandler('ingest.createTableFromSource', async (_event, params) => {
    const result = await fileService.createTableFromSource(params)
    return { success: true, data: result }
  })

  registerHandler('ingest.cleanupIngestion', async (_event, { tempTableNames, tempFilePaths }) => {
    await fileService.cleanupStaging(tempTableNames, tempFilePaths)
    return { success: true }
  })

  registerHandler('ingest.cleanupAllStaging', async () => {
    await fileService.cleanupAllStaging()
    return { success: true }
  })

  registerHandler('ingest.ingestJson', async (_event, { tableName, rows }) => {
    const result = await ingestJsonData(databaseService, tableName, rows)
    return { success: true, data: result }
  })

  // --- Domain: SQL & DB Core ---
  registerHandler('sql.runSQL', async (_event, sql) => {
    const result = await executeSQL(sql, databaseService)
    return { success: true, data: result }
  })

  registerHandler('sql.generateSQL', async (_event, { prompt, schema }) => {
    const result = await aiService.generatePlan({ userQuery: prompt, schemas: schema }, projectManager.getCurrentProjectPath())
    return { success: true, data: result.sql || '' }
  })

  registerHandler('db.getSchema', async (_event, tableName) => {
    const result = await databaseService.getSchema(tableName)
    return { success: true, data: result }
  })

  registerHandler('db.deleteTable', async (_event, tableName) => {
    await fileService.deleteTable(tableName)
    return { success: true }
  })

  registerHandler('db.resetDB', async () => {
    await databaseService.dropAllTables()
    return { success: true }
  })

  registerHandler('app.resetApp', async () => {
    aiService.clearConfig()
    authService.reset()
    new Store().clear()
    secureClear()
    return { success: true }
  })

  // --- Domain: AI & Analysis ---
  registerHandler('ai.askAI', async (_event, params) => {
    const result = await aiService.generatePlan(params, projectManager.getCurrentProjectPath())
    return { success: true, data: result }
  })

  registerHandler('ai.fixSQL', async (_event, params) => {
    const result = await aiService.fixQuery(params.originalSql, params.error, params.schemas, params.domainRules, projectManager.getCurrentProjectPath())
    return { success: true, data: result }
  })

  registerHandler('ai.analyzeContext', async (_event, { schemas, language }) => {
    const result = await aiService.getContextAnalysis(schemas, language, projectManager.getCurrentProjectPath())
    return { success: true, data: result }
  })

  registerHandler('ai.analyzeSemantics', async (_event, { tableName, columns, language }) => {
    const result = await aiService.analyzeSemantics(tableName, columns, language, projectManager.getCurrentProjectPath())
    return { success: true, data: result }
  })

  registerHandler('ai.generateMetricExpression', async (_event, options) => {
    const result = await aiService.generateMetricExpression({ ...options, projectPath: projectManager.getCurrentProjectPath() })
    return { success: true, data: result }
  })

  registerHandler('ai.generateInsight', async (_event, context) => {
    const result = await aiService.generateChartInsight(context, projectManager.getCurrentProjectPath())
    return { success: true, data: result }
  })

  registerHandler('ai.aiPreviewExtract', async (_event, { sampleData, prompt }) => {
    const result = await aiService.previewExtraction(sampleData, prompt, projectManager.getCurrentProjectPath())
    let estimatedCost = 0
    if (result.usage) {
      estimatedCost = tokenManager.calculateCost(aiService.getConfig().model, result.usage.input, result.usage.output)
    }
    return { success: true, data: { ...result, estimatedCost } }
  })

  registerHandler('ai.aiBatchExtract', async (event, { tableName, columnName, targetColumnName, prompt }) => {
    const result = await aiService.startBatchExtraction(tableName, columnName, targetColumnName, prompt, projectManager.getCurrentProjectPath(), BrowserWindow.fromWebContents(event.sender) || undefined)
    return { success: true, data: result }
  })

  registerHandler('ai.dropAIColumn', async (_event, { tableName, columnName }) => {
    try {
      const sidecarName = getSidecarTableName(tableName)
      await databaseService.exec(`ALTER TABLE "${sidecarName}" DROP COLUMN "${columnName}"`)
      return { success: true }
    } catch (e: unknown) {
      console.error(`[IPC] Failed to drop AI column: ${columnName}`, e)
      return { success: false, error: getErrorMessage(e) }
    }
  })

  registerHandler('ai.getAIConfig', async () => {
    return { success: true, data: aiService.getConfig() }
  })

  registerHandler('ai.setAIConfig', async (_event, config) => {
    aiService.setConfig(config)
    return { success: true }
  })

  registerHandler('ai.clearAIConfig', async () => {
    aiService.clearConfig()
    return { success: true }
  })

  registerHandler('ai.verifyAIConnection', async (_event, config) => {
    const result = await aiService.verifyConnection(config)
    return { success: true, data: result }
  })

  // --- Domain: Export & Save ---
  registerHandler('export.exportWebReport', async (_event, { widgets, config, fullSnapshot }) => {
    return await exportWebReport(aiService, widgets, config, fullSnapshot)
  })

  registerHandler('export.exportExcel', async (_event, payload) => {
    return await exportExcel(payload)
  })

  registerHandler('save.saveImage', async (_event, { dataUrl, name }) => {
    const { filePath } = await dialog.showSaveDialog({ defaultPath: name || 'image.png', filters: [{ name: 'Images', extensions: ['png'] }] })
    if (filePath) {
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')
      await fs.writeFile(filePath, base64Data, 'base64')
      return { success: true, data: filePath }
    }
    return { success: false, error: 'Cancelled' }
  })

  registerHandler('save.saveFile', async (_event, { content, extension, name }) => {
    const { filePath } = await dialog.showSaveDialog({ defaultPath: name, filters: [{ name: 'Files', extensions: [extension] }] })
    if (filePath) {
      if (extension === 'pdf' || extension === 'zip') await fs.writeFile(filePath, Buffer.from(content, 'base64'))
      else await fs.writeFile(filePath, content, 'utf-8')
      return { success: true, data: filePath }
    }
    return { success: false, error: 'Cancelled' }
  })

  registerHandler('export.exportReport', async (event, payload: ExportReportPayload | undefined) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window' }
    const { type, title } = payload || {}
    if (type === 'png') {
      const image = await win.webContents.capturePage()
      const { filePath, canceled } = await dialog.showSaveDialog({ defaultPath: `${title || 'report'}.png`, filters: [{ name: 'Images', extensions: ['png'] }] })
      if (!filePath || canceled) return { success: false, error: 'Cancelled' }
      await fs.writeFile(filePath, image.toPNG())
      return { success: true, data: filePath }
    }
    return { success: false, error: 'Not implemented' }
  })

  console.log('IPC handlers registered successfully.')
  return { fileService }
}