import React from 'react'
import { Button } from '@/components/ui/button'
import { useLogStore } from '../../stores/useLogStore'
import i18n from '../../i18n'

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error; componentStack?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    this.setState({ componentStack: errorInfo.componentStack })
    void useLogStore.getState().addLog({
      type: 'error',
      message: error.message,
      stack: error.stack + '\n--- Component Stack ---\n' + errorInfo.componentStack,
    })
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-50 p-8 text-center overflow-auto">
          <h2 className="text-xl font-bold mb-2">
            {i18n.t('error_boundary_title', { ns: 'common' })}
          </h2>
          <p className="text-zinc-500 mb-2 max-w-md text-sm">
            {i18n.t('error_boundary_description', {
              ns: 'common',
              error_message: err?.message || 'unknown error',
            })}
          </p>
          {err && (
            <div className="max-w-2xl w-full text-left mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-mono whitespace-pre-wrap break-all">
              <div className="font-bold mb-1">Error: {err.message}</div>
              <div className="text-red-600">{err.stack}</div>
              {this.state.componentStack && (
                <div className="mt-2 text-amber-700">
                  <div className="font-bold">Component Stack:</div>
                  {this.state.componentStack}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => window.location.reload()}>
              {i18n.t('error_boundary_reload_button', { ns: 'common' })}
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
