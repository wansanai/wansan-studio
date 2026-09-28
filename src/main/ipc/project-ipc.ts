import { dialog, app } from 'electron'
import path from 'path'
import { ProjectManager } from '../services/project-manager'
import { registerHandler } from '../utils/ipc-helper'

export function registerProjectHandlers(projectManager: ProjectManager) {
  registerHandler(
    'project.projectCreate',
    async (_event, { name, location }) => {
      let targetLocation = location
      if (!targetLocation) {
        const { filePaths } = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
          title: 'Select Project Location',
          buttonLabel: 'Select',
        })
        if (filePaths && filePaths.length > 0) {
          targetLocation = filePaths[0]
        } else {
          return { success: false, error: 'Cancelled' }
        }
      }

      const projectPath = await projectManager.createProject(
        name,
        targetLocation
      )
      return { success: true, data: projectPath }
    }
  )

  registerHandler('project.projectOpen', async (_event, projectPath) => {
    let targetPath = projectPath
    if (!targetPath) {
      const { filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Open Project',
        // Note: macOS doesn't filter directories by extension well in openDialog,
        // but we can guide the user.
        message: 'Select a .wansan project directory',
      })
      if (filePaths && filePaths.length > 0) {
        targetPath = filePaths[0]
      } else {
        return { success: false, error: 'Cancelled' }
      }
    }

    const result = await projectManager.openProject(targetPath)
    return { success: true, data: result }
  })

  registerHandler(
    'project.projectSave',
    async (_event, { path, data }) => {
      await projectManager.saveProject(path, data)
      return { success: true }
    }
  )

  registerHandler('project.projectClose', async () => {
    await projectManager.closeProject()
    return { success: true }
  })

  registerHandler('project.projectGetDefaultPath', async () => {
    const documents = app.getPath('documents')
    return { success: true, data: path.join(documents, 'Wansan') }
  })
}
