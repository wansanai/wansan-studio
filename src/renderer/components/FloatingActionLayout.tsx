import { ReactNode } from 'react'
import { Button } from './ui/button'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../stores/useProjectStore'

interface FloatingActionLayoutProps {
  children: ReactNode
  showAction?: boolean
}

export function FloatingActionLayout({
  children,
  showAction = true,
}: FloatingActionLayoutProps) {
  const setAppMode = useProjectStore(state => state.setAppMode)
  const { t } = useTranslation('common')

  const handleStartAnalysis = () => {
    const { activeSessionId, createSession } = useProjectStore.getState()
    if (!activeSessionId) {
      createSession()
    }
    setAppMode('analysis')
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {children}
      </div>
      {showAction && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Button
            size="lg"
            className="rounded-full shadow-xl px-8 bg-black hover:bg-zinc-800 hover:scale-105 transition-all"
            onClick={handleStartAnalysis}
          >
            ✨ {t('start_analysis')}
          </Button>
        </div>
      )}
    </div>
  )
}
