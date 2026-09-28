import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import debounce from 'lodash.debounce'
import { useProjectStore } from '../stores/useProjectStore'
import { useProjectIO } from './useProjectIO'
import { hasPersistentProjectChanges } from '@/components/main-content-utils'

export type AutoSaveStatus = 'saved' | 'saving' | 'error' | 'unsaved'

export { hasPersistentProjectChanges }

export function useAutoSave() {
  const [status, setStatus] = useState<AutoSaveStatus>('saved')
  const [lastError, setLastError] = useState<string | null>(null)
  const { saveProject } = useProjectIO()
  const currentProjectPath = useProjectStore(s => s.currentProjectPath)

  const isDirty = useRef(false)

  const performSave = useCallback(async () => {
    if (!currentProjectPath || !isDirty.current) return

    setStatus('saving')
    try {
      await saveProject()
      isDirty.current = false
      setStatus('saved')
      setLastError(null)
    } catch (err: any) {
      console.error('Auto-save failed:', err)
      setStatus('error')
      setLastError(err.message || 'Failed to save project')
    }
  }, [currentProjectPath, saveProject])

  const debouncedSave = useMemo(
    () =>
      debounce(() => {
        performSave()
      }, 2000),
    [performSave]
  )

  useEffect(() => {
    if (!currentProjectPath) return

    const unsub = useProjectStore.subscribe((state, prevState) => {
      if (hasPersistentProjectChanges(state, prevState)) {
        isDirty.current = true
        setStatus('unsaved')
        debouncedSave()
      }
    })

    return () => {
      unsub()
      debouncedSave.cancel()
    }
  }, [currentProjectPath, debouncedSave])

  useEffect(() => {
    const handleBlur = () => {
      if (isDirty.current) {
        debouncedSave.cancel()
        performSave()
      }
    }

    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [performSave, debouncedSave])

  useEffect(() => {
    const handleBeforeUnload = (_e: BeforeUnloadEvent) => {
      if (isDirty.current) {
        performSave()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [performSave])

  return {
    status,
    lastError,
    forceSave: performSave,
  }
}
