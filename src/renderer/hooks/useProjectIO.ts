import { useCallback } from 'react'
import { useProjectStore } from '../stores/useProjectStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useProGate } from '@/hooks/use-pro-gate'
import { projectService } from '../services/project-service'
import { ProjectLoadResult, ProjectManifest } from '@shared/types/project-manifest'
import { Analytics } from '../services/analytics'
import { getCleanedRegistry } from '../utils/project-utils'
import {
  buildProjectDataFromLoadResult,
  buildProjectSemantic,
} from '@/components/main-content-utils'

const TRIAL_PROJECT_LIMIT = 2

export { buildProjectDataFromLoadResult, buildProjectSemantic }

export function useProjectIO() {
  const setProjectPath = useProjectStore(state => state.setProjectPath)
  const loadProjectToStore = useProjectStore(state => state.loadProject)
  const { addRecentProject, recentProjectPaths, isActivated } =
    useSettingsStore()
  const { checkGate, gateNode } = useProGate()

  const saveProject = useCallback(async () => {
    const state = useProjectStore.getState()
    const path = state.currentProjectPath

    if (!path) {
      throw new Error('No project path set. Use create or open first.')
    }

    const assets = state.files.map(f => ({
      id: f.id,
      name: f.name,
      tableName: f.tableName,
      source: f.source,
      status: f.status,
      rowCount: f.rowCount,
      lastModified: f.lastModified,
      createdAt: f.createdAt,
      displayState: f.displayState,
      columns: f.columns.map(c => ({
        name: c.name,
        type: c.type,
        safeName: c.safeName,
        sampleValues: c.sampleValues,
        nullable: c.nullable,
        isPrimaryKey: c.isPrimaryKey,
        semantic: c.semantic,
      })),
    }))

    const manifest: Partial<ProjectManifest> = {
      assets: assets.map((a, i) => {
        const file = state.files[i]
        return {
          ...a,
          smartMetrics: file.smartMetrics,
          relations: file.relations,
        }
      }) as any,
      tableViews: state.tableViews || {},
      settings: {
        theme: 'light',
      },
    }

    const semantic = buildProjectSemantic(state)

    const cleanedRegistry = getCleanedRegistry(
      state.widgetRegistry,
      state.sessions
    )

    const sessionData = {
      sessions: state.sessions,
      activeSessionId: state.activeSessionId,
      activeView: state.activeView,
      activeFileId: state.activeFileId,
      widgetRegistry: cleanedRegistry,
    }

    await projectService.save(path, {
      manifest,
      semantic,
      session: sessionData,
    })
  }, [])

  const openProject = useCallback(
    async (path?: string) => {
      let targetPath = path

      if (!targetPath) {
        targetPath = await projectService.selectDirectory()
        if (!targetPath) return
      }

      if (!isActivated && recentProjectPaths.length >= 2) {
        const isRecent = recentProjectPaths.includes(targetPath)
        if (!isRecent) {
          checkGate('Multi-Project', () => {})
          return null
        }
      }

      const data: ProjectLoadResult = await projectService.open(targetPath)
      const projectData = buildProjectDataFromLoadResult(data)

      loadProjectToStore(projectData)
      setProjectPath(data.path)
      addRecentProject(data.path)

      Analytics.track('project_opened', {
        asset_count: projectData.files.length,
        has_metrics: projectData.files.some(
          f => (f.smartMetrics?.length || 0) > 0
        ),
      })
    },
    [
      loadProjectToStore,
      setProjectPath,
      isActivated,
      recentProjectPaths,
      addRecentProject,
      checkGate,
    ]
  )

  const createProject = useCallback(
    async (name: string, location: string) => {
      if (!isActivated && recentProjectPaths.length >= TRIAL_PROJECT_LIMIT) {
        checkGate('Multi-Project', () => {})
        return null
      }

      const path = await projectService.create(name, location)
      addRecentProject(path)
      await openProject(path)

      Analytics.track('project_created', {})
      return path
    },
    [openProject, isActivated, recentProjectPaths, addRecentProject, checkGate]
  )

  const closeProject = useCallback(async () => {
    await projectService.close()
    setProjectPath(null)
    useProjectStore.getState().reset()
  }, [setProjectPath])

  return {
    saveProject,
    openProject,
    createProject,
    closeProject,
    checkGate,
    gateNode,
  }
}
