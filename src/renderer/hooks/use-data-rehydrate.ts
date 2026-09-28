import { useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/useProjectStore'
import { rehydrateProjectData } from './use-data-rehydrate-utils'

export function useDataRehydrate() {
  const isProjectLoaded = useProjectStore(s => s.isProjectLoaded)
  const hasRunRef = useRef(false)

  useEffect(() => {
    if (hasRunRef.current || !isProjectLoaded) return

    hasRunRef.current = true

    const syncViews = async () => {
      console.log('[Rehydrate] Starting Logical View Sync...')

      const store = useProjectStore.getState()
      await rehydrateProjectData(
        store.files,
        {
          runSQL: sql => window.electronAPI.runSQL(sql),
          deleteTable: tableName => window.electronAPI.deleteTable(tableName),
          reIngestFile: params => window.electronAPI.reIngestFile(params),
        },
        {
          setRestoring: value => useProjectStore.getState().setRestoring(value),
          reloadFile: (fileId, result) =>
            useProjectStore.getState().reloadFile(fileId, result),
          markAsStale: ids => useProjectStore.getState().markAsStale(ids),
          updateFile: (id, updates) => useProjectStore.getState().updateFile(id, updates),
          markFileMissing: id => useProjectStore.getState().markFileMissing(id),
          refreshFileMetadata: fileId =>
            useProjectStore.getState().refreshFileMetadata(fileId),
          getFiles: () => useProjectStore.getState().files,
        }
      )

      console.log('[Rehydrate] Rehydration finished.')
    }

    syncViews().catch(e => {
      console.error('[Rehydrate] Fatal error during view sync:', e)
      useProjectStore.getState().setRestoring(false)
    })
  }, [isProjectLoaded])
}
