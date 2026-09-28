import { useEffect } from 'react'
import { useLogStore } from '../../stores/useLogStore' // Adjust path
import { isDev } from '../../utils/env'

export function GlobalErrorHandler() {
  const addLog = useLogStore(s => s.addLog)

  useEffect(() => {
    // 1. JS Errors
    const handleError = (event: ErrorEvent) => {
      // [FIX] Ignore benign ResizeObserver notifications loop errors
      if (
        event.message === 'ResizeObserver loop limit exceeded' ||
        event.message === 'ResizeObserver loop completed with undelivered notifications.'
      ) {
        return
      }

      if (isDev) {
        console.error('[Global Error Handler] Caught error:', {
          message: event.message,
          error: event.error,
        })
      }
      void addLog({
        type: 'error',
        message: event.message,
        stack: event.error?.stack,
      })
    }

    // 2. Promise Rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isDev) {
        console.error('[Global Error Handler] Caught rejection:', {
          reason: event.reason,
        })
      }
      void addLog({
        type: 'error',
        message: `Unhandled Rejection: ${event.reason?.message || event.reason}`,
        stack: event.reason?.stack,
      })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [addLog]) // addLog should be in dependency array

  return null
}
