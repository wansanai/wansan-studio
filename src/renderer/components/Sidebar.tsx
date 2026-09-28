import { useState } from 'react'
import {
  BrainCircuit,
  Crown,
  Database,
  LogOut,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { Button } from './ui/button'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import { DataAssetsView } from './sidebar/DataAssetsView'
import { SessionListView } from './sidebar/SessionListView'
import { useProjectStore } from '../stores/useProjectStore'
import { useUserInfo } from '@/hooks/useIPC'
import { ProjectRulesModal } from './modals/ProjectRulesModal'

interface SidebarProps {
  onImportData?: () => void
}

export function Sidebar(_props: SidebarProps) {
  const appMode = useProjectStore(state => state.appMode)
  const setAppMode = useProjectStore(state => state.setAppMode)
  const closeProject = useProjectStore(state => state.closeProject)
  const files = useProjectStore(state => state.files)
  const hasFiles = files.length > 0

  const { t } = useTranslation('common')
  const settings = useSettingsStore()
  const createSession = useProjectStore(state => state.createSession)
  const { data: userInfo } = useUserInfo()
  const username = userInfo?.username || 'User'
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false)

  return (
    <aside className="wansan-sidebar flex flex-col h-full bg-transparent shrink-0">
      {/* --- MODE SWITCHER --- */}
      <div className="pt-2 px-3 pb-1 shrink-0">
        <div className="flex p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
          <button
            onClick={() => setAppMode('analysis')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all',
              appMode === 'analysis'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            <Sparkles className={cn("w-3.5 h-3.5", appMode === 'analysis' ? "text-indigo-500" : "text-zinc-400")} />
            {t('sidebar.mode_analysis')}
          </button>
          <button
            onClick={() => setAppMode('data')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all',
              appMode === 'data'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            <Database className={cn("w-3.5 h-3.5", appMode === 'data' ? "text-indigo-500" : "text-zinc-400")} />
            {t('sidebar.mode_data')}
          </button>
        </div>
      </div>

      {/* --- HEADER ACTIONS --- */}
      {appMode === 'analysis' && (
        <div className="px-3 pb-2 pt-1 shrink-0">
          <Button
            onClick={() => createSession()}
            disabled={!hasFiles}
            title={
              !hasFiles
                ? t('import_first_hint', 'Please import data first')
                : undefined
            }
            className={cn(
              'w-full h-9 text-sm font-medium transition-all shadow-sm justify-center gap-2 rounded-md active:scale-95',
              hasFiles
                ? 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
                : 'bg-zinc-100 text-zinc-400 opacity-50 cursor-not-allowed'
            )}
          >
            <Plus className="h-4 w-4" />
            <span>{t('new_session', 'New Session')}</span>
          </Button>
        </div>
      )}

      {/* --- SCROLL AREA --- */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {appMode === 'analysis' ? (
          <div className="flex-1 overflow-y-auto min-h-0 px-2 py-1">
            <div className="px-3 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              {t('history', 'History')}
            </div>
            <SessionListView />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden min-h-0">
            <DataAssetsView />
          </div>
        )}
      </div>

      {/* --- FOOTER --- */}
      <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-800/50 space-y-1.5 shrink-0">
        {/* Business Rules - Only show in analysis or data? 
            In Data mode, it might be better to have it as part of the asset tree, 
            but keeping it here for now for parity. */}
        <button
          onClick={() => setIsRulesModalOpen(true)}
          className="w-full px-2.5 py-2 text-sm text-left rounded-lg flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-900/80 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all group active:scale-[0.98]"
        >
          <div className="w-7 h-7 flex items-center justify-center shrink-0">
            <BrainCircuit className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="font-medium flex-1">
            {t('domain.title', 'Business Rules')}
          </span>
        </button>

        {/* User & System (Compact Row) */}
        <div className="flex items-center gap-1">
          <div
            onClick={() =>
              document.dispatchEvent(
                new CustomEvent('open-settings', { detail: 'general' })
              )
            }
            className="flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-100/80 dark:hover:bg-zinc-900/80 transition-all group/user cursor-pointer active:scale-[0.98] overflow-hidden"
          >
            <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 shrink-0 shadow-sm group-hover/user:border-zinc-300 dark:group-hover/user:border-zinc-600 transition-colors">
              {username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0 leading-tight">
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">
                {username}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {settings.isSpecialChannel ? (
                  <div
                    className={cn(
                      'text-[9px] font-black uppercase tracking-[0.15em] flex items-center gap-1 px-1.5 py-0.5 rounded-sm',
                      settings.isExpired
                        ? 'bg-red-50 text-red-600 border border-red-100'
                        : 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                    )}
                  >
                    {settings.isExpired ? (
                      <span>{t('sidebar.expired', 'EXPIRED')}</span>
                    ) : (
                      <>
                        <Sparkles className="w-2.5 h-2.5 fill-current" />
                        <span className="truncate max-w-[80px]">
                          {settings.remoteConfig.channel ||
                            t('sidebar.special_access', 'SPECIAL')}
                        </span>
                      </>
                    )}
                  </div>
                ) : settings.isActivated ? (
                  <div className="text-[9px] text-amber-600 dark:text-amber-500 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Crown className="w-2.5 h-2.5 fill-current" />
                    <span>{t('sidebar.pro_active', 'PRO ACTIVE')}</span>
                  </div>
                ) : (
                  <div className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wider">
                    {t('sidebar.trial_mode', 'TRIAL MODE')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Close Project Action */}
          <button
            onClick={e => {
              e.stopPropagation()
              closeProject()
            }}
            title={t('close_project', 'Close Project')}
            className="text-zinc-400 dark:text-zinc-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all p-2 rounded-lg shrink-0 active:scale-90"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      <ProjectRulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
      />
    </aside>
  )
}
