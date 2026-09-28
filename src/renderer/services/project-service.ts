import {
  ProjectSavePayload,
  ProjectLoadResult,
} from '../../shared/types/project-manifest'

export const projectService = {
  create: async (name: string, location: string) => {
    const res = await window.electronAPI.projectCreate({ name, location })
    if (!res.success) throw new Error(res.error || 'Failed to create project')
    return res.data!
  },

  open: async (path?: string) => {
    const res = await window.electronAPI.projectOpen(path)
    if (!res.success) throw new Error(res.error || 'Failed to open project')
    return res.data as ProjectLoadResult
  },

  save: async (path: string, data: ProjectSavePayload) => {
    const res = await window.electronAPI.projectSave({ path, data })
    if (!res.success) throw new Error(res.error || 'Failed to save project')
  },

  close: async () => {
    const res = await window.electronAPI.projectClose()
    if (!res.success) throw new Error(res.error || 'Failed to close project')
  },

  getDefaultLocation: async () => {
    const res = await window.electronAPI.projectGetDefaultPath()
    if (!res.success) throw new Error(res.error || 'Failed to get default path')
    return res.data!
  },

  selectDirectory: async () => {
    const res = await window.electronAPI.selectDirectory()
    if (!res.success) throw new Error(res.error || 'User cancelled directory selection')
    return res.data!
  },
}