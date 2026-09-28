import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'
import { isDev } from './utils/env'
import Store from 'electron-store'
import debounce from 'lodash.debounce'

import { setupIPC } from './services/ipc'
// import { DatabaseService } from './database/duckdb'
import { NativeDatabaseService } from './services/native-db-service'
import { AIService } from './services/ai-service' // Import AIService
import { dbClient } from './services/db-service/client'
import { ProjectManager } from './services/project-manager'
import { DBConnectorService } from './services/connector-service'
import { BatchProcessor } from './services/batch-processor'
import { FileService } from './services/file'
import { registerProjectHandlers } from './ipc/project-ipc'
import { registerHandler } from './utils/ipc-helper'
import { createApplicationMenu } from './config/menu'
import { authService } from './services/auth-service'
import { setupFetchLogger } from './utils/fetch-logger'
import { setupLogger } from './utils/logger'
import { getAppUserAgent } from './utils/env'
import type { AppConfig } from '../shared/types'

class WansanApp {
  private mainWindow: BrowserWindow | null = null
  private databaseService: NativeDatabaseService | null = null
  private aiService: AIService | null = null // Add AIService property
  private projectManager: ProjectManager | null = null
  private connectorService: DBConnectorService | null = null
  // private duckdbNativeService: any = null // Removed: now in dbClient
  // private pendingQueries = new Map<string, { resolve: Function; reject: Function }>() // Removed

  constructor() {
    this.init()
  }

  private async init() {
    // Initialize Logger first
    setupLogger()

    // 加载环境变量 (仅开发模式)
    if (isDev()) {
      setupFetchLogger()
      try {
        const dotenv = await import('dotenv')
        const envPath = join(app.getAppPath(), '.env')
        const result = dotenv.config({ path: envPath })
        console.log(`[Main] Loading .env from ${envPath}`)
        console.log(
          '[Main] .env loaded result:',
          result.parsed ? Object.keys(result.parsed).join(',') : 'No keys',
          'Error:',
          result.error
        )
        console.log('[Main] OPENAI_MODEL from env:', process.env.OPENAI_MODEL)

        // [Fix] Refresh Auth Service env after loading .env
        authService.loadEnv()
      } catch (error) {
        console.error('Failed to load .env file:', error)
      }
    }

    // 等待 Electron 准备就绪
    await app.whenReady()

    // 设置全局 User-Agent 降级
    app.userAgentFallback = getAppUserAgent()

    // 创建 AI Service 实例
    this.aiService = new AIService()

    // 创建主窗口
    this.createMainWindow()

    // 初始化数据库服务
    this.databaseService = new NativeDatabaseService()

    // Initialize Connector Service
    this.connectorService = new DBConnectorService(this.databaseService)

    // Initialize Project Manager
    this.projectManager = new ProjectManager(this.databaseService)

    // Initialize Batch Processor [V1.7]
    const fileServiceInstance = new FileService(this.databaseService)
    const batchProcessor = new BatchProcessor(
      this.databaseService,
      this.aiService,
      fileServiceInstance
    )
    this.aiService.setBatchProcessor(batchProcessor)

    // 设置 IPC 通信
    this.setupIPC()

    // Register Project IPC Handlers
    registerProjectHandlers(this.projectManager)

    // Fetch Remote Config
    this.fetchRemoteConfig()

    // Handle Language Change
    registerHandler('app.setLanguage', async (_event, lang) => {
      if (this.mainWindow) {
        createApplicationMenu(this.mainWindow, lang)
      }
      return { success: true }
    })

    // 在开发模式下启动时清理 AI 配置
    // if (isDev()) {
    //   this.aiService.clearConfig()
    // }

    // 设置应用事件监听
    this.setupAppEvents()
  }

  private createMainWindow() {
    const store = new Store()
    const defaultBounds = { width: 1280, height: 800 }
    const bounds = store.get('windowBounds', defaultBounds) as any

    const resourcesDir = join(process.cwd(), 'resources')
    const devWindowIconPath =
      process.platform === 'win32'
        ? join(resourcesDir, 'icon.ico')
        : join(resourcesDir, 'icon.png')

    const setDockIcon = () => {
      if (!isDev() || process.platform !== 'darwin') return
      const icnsIcon = nativeImage.createFromPath(
        join(resourcesDir, 'icon.icns')
      )
      const pngFallback = nativeImage.createFromPath(
        join(resourcesDir, 'icon.png')
      )
      const iconToUse = !icnsIcon.isEmpty() ? icnsIcon : pngFallback
      if (iconToUse.isEmpty()) return
      try {
        app.dock.setIcon(icnsIcon)
      } catch (error) {
        console.warn('Failed to set dock icon:', error)
      }
    }

    setDockIcon()

    this.mainWindow = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      minWidth: 1024,
      minHeight: 600,
      autoHideMenuBar: true,
      ...(isDev() && process.platform !== 'darwin'
        ? { icon: devWindowIconPath }
        : {}),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(app.getAppPath(), 'dist/preload/index.cjs'),
        // [CRITICAL] Disable DevTools in Production
        devTools: !app.isPackaged,
      },
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      show: false, // 先隐藏，加载完成后再显示
    })

    const saveState = debounce(() => {
      if (!this.mainWindow) return
      try {
        store.set('windowBounds', this.mainWindow.getBounds())
      } catch (e) {
        console.error('Failed to save window bounds', e)
      }
    }, 1000)

    this.mainWindow.on('resize', saveState)
    this.mainWindow.on('move', saveState)

    // Set Menu
    createApplicationMenu(this.mainWindow)

    // 加载应用
    if (isDev()) {
      this.mainWindow.loadURL('http://localhost:5173')
      // 自动开启控制台
      this.mainWindow.webContents.openDevTools({ mode: 'detach' })
    } else {
      // 在生产环境中，loadFile 默认相对于 app.getAppPath() (即 app.asar)
      // 尝试直接加载 dist/renderer/index.html
      const entry = 'dist/renderer/index.html'
      this.mainWindow.loadFile(entry).catch(e => {
        console.error('Failed to load local file:', entry, e)
      })
    }

    // 窗口准备好后显示
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show()
      setDockIcon()
    })

    // 监听全屏状态变化，同步给渲染进程（处理系统级退出全屏）
    this.mainWindow.on('leave-full-screen', () => {
      this.mainWindow?.webContents.send('window-state-changed', {
        isFullScreen: false,
      })
    })

    this.mainWindow.on('enter-full-screen', () => {
      this.mainWindow?.webContents.send('window-state-changed', {
        isFullScreen: true,
      })
    })

    // 窗口关闭事件
    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    ipcMain.on('window-control', (event, action) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return

      switch (action) {
        case 'enter-fullscreen':
          win.setFullScreen(true)
          break
        case 'exit-fullscreen':
          win.setFullScreen(false)
          break
        case 'toggle-maximize':
          if (win.isMaximized()) win.unmaximize()
          else win.maximize()
          break
        default:
          break
      }
    })
  }

  private setupIPC() {
    if (
      !this.databaseService ||
      !this.aiService ||
      !this.connectorService
    ) {
      throw new Error('Services not initialized')
    }

    const { fileService } = setupIPC(
      this.databaseService,
      this.aiService,
      this.connectorService,
      this.projectManager
    )

    // Cleanup orphaned temp files from previous sessions on boot
    fileService.cleanupTempFiles().catch(err => {
      console.error('[Main] Initial cleanup failed:', err)
    })
  }

  private setupAppEvents() {
    // 应用退出处理
    app.on('window-all-closed', () => {
      app.quit()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow()
      }
    })

    // 应用退出前清理
    app.on('before-quit', async (_event) => {
      // Prevent immediate quit to allow cleanup
      if (this.projectManager) {
        await this.projectManager.waitForPendingSaves()
      }

      if (this.databaseService) {
        await this.databaseService.close()
      }
      await dbClient.stop()
    })
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  public getDatabaseService(): NativeDatabaseService | null {
    return this.databaseService
  }

  public getAIService(): AIService | null {
    return this.aiService
  }

  private async fetchRemoteConfig() {
    try {
      // 1. Fetch from Remote (Async)
      const remoteData = await authService.fetchRemoteConfig()

      // 2. Calculate final Auth State (Merging Local + Remote)
      const authState = await authService.getAuthState(remoteData || undefined)

      // 3. Prepare Config Payload
      const config: AppConfig = {
        ...(remoteData || {}),
        ...authState, // isActivated, channel, specialExpiry, etc.
        // Fallback for offline mode if remoteData is null
        isOffline: !remoteData,
        managedAI: this.aiService?.getManagedConfig() || undefined,
      }

      // 4. Send to Renderer
      this.sendConfigToRenderer(config)
    } catch (e) {
      console.error('[Main] Auth flow failed:', e)
      // Extreme fallback
      this.sendConfigToRenderer({ isOffline: true })
    }
  }

  private sendConfigToRenderer(config: AppConfig | { isOffline: boolean }) {
    if (this.mainWindow) {
      if (this.mainWindow.webContents.isLoading()) {
        this.mainWindow.webContents.once('did-finish-load', () => {
          this.mainWindow?.webContents.send('app:remote-config', config)
        })
      } else {
        this.mainWindow.webContents.send('app:remote-config', config)
      }
    }
  }
}

// 创建应用实例
const wansanApp = new WansanApp()

export { wansanApp }
