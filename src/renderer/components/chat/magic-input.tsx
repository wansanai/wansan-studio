import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import {
  ArrowUp,
  Bug,
  CornerDownRight,
  Database,
  Download,
  Eraser,
  FileSpreadsheet,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { cn } from '@/utils/cn.ts'
import { useProjectStore } from '@/stores/useProjectStore.ts'
import { useChatStore } from '@/stores/useChatStore.ts'
import { useToastStore } from '@/stores/useToastStore.ts'
import { useSettingsStore } from '@/stores/useSettingsStore.ts'
import { useSqlLabStore } from '@/stores/useSqlLabStore.ts'

import type { ChatMessage } from '../ChatInterface'
import { useTranslation } from 'react-i18next'
import { exportDebugLog } from '@/utils/debug-exporter.ts'
import { generateMarkdown } from '@/utils/markdown-exporter.ts'
import { collectExcelDataFromChat } from '@/utils/export-utils.ts'
import { useProGate } from '@/hooks/use-pro-gate'
import { sanitizeFilename } from '@shared/naming-utils'

interface MagicInputProps {
  onSubmit: (value: string) => void
  loading?: boolean
  placeholder?: string
  messages: ChatMessage[]
  className?: string
}

type MentionState =
  | {
      active: true
      start: number
      query: string
    }
  | { active: false }

export function MagicInput({
  onSubmit,
  loading = false,
  placeholder = 'Ask about your data...',
  messages,
  className,
}: MagicInputProps) {
  const activeSessionId = useProjectStore(state => state.activeSessionId)
  const activeSession = useProjectStore(state =>
    state.sessions.find(s => s.id === state.activeSessionId)
  )
  const setInputDraft = useProjectStore(state => state.setInputDraft)

  // 1. Local state for all typing interaction (prevents global re-renders)
  const [value, setValue] = useState(activeSession?.inputDraft ?? '')

  // 2. Ref to track the latest value for the unmount sync logic
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  // 3. Sync to store on unmount, session switch, or when window loses focus/visibility
  useEffect(() => {
    // Capture the session ID this effect instance is tied to
    const capturedSessionId = activeSessionId;

    const syncDraft = () => {
      if (valueRef.current !== undefined && capturedSessionId) {
        // Don't save a single '/' or '@' as a meaningful draft if user hasn't typed more
        const cleanValue = valueRef.current.trim()
        const valueToSave = (cleanValue === '/' || cleanValue === '@') ? '' : valueRef.current
        
        // Use the captured ID to ensure we save to the correct session during a switch
        useProjectStore.getState().setInputDraft(valueToSave, capturedSessionId)
      }
    }

    // Handle background/blur events
    window.addEventListener('blur', syncDraft)
    window.addEventListener('visibilitychange', syncDraft)

    return () => {
      // Save draft when switching sessions or unmounting the component
      syncDraft()
      window.removeEventListener('blur', syncDraft)
      window.removeEventListener('visibilitychange', syncDraft)
    }
  }, [activeSessionId])

  // 4. Initialize local state when session changes
  useEffect(() => {
    setValue(activeSession?.inputDraft ?? '')
  }, [activeSessionId, activeSession?.inputDraft])

  const [cursorPosition, setCursorPosition] = useState(0)
  const [mention, setMention] = useState<MentionState>({ active: false })
  const [mentionIndex, setMentionIndex] = useState(0)
  const [triggerType, setTriggerType] = useState<'table' | 'command' | null>(
    null
  )
  const [popoverOpen, setPopoverOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const autoAttachedIdRef = useRef<string | null>(null)

  const replyToId = useChatStore(state => state.replyToId)
  const setReplyTo = useChatStore(state => state.setReplyTo)
  const resetChat = useChatStore(state => state.reset)
  const removeMessage = useChatStore(state => state.removeMessage)
  const stopGeneration = useChatStore(state => state.stopGeneration)
  const addToast = useToastStore(state => state.addToast)
  const files = useProjectStore(state => state.files)
  const isRestoring = useProjectStore(state => state.isRestoring)
  const suggestedPrompts = useProjectStore(state => state.suggestedPrompts)
  const { isActivated } = useSettingsStore()
  const { t } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const refreshSessionWidgets = useProjectStore(
    state => state.refreshSessionWidgets
  )
  const setRefreshing = useProjectStore(state => state.setRefreshing)
  const { checkGate, gateNode } = useProGate()
  const openSqlLab = useSqlLabStore(state => state.open)
  const addManualSqlMessage = useChatStore(state => state.addManualSqlMessage)

  // Auto-set refinement context to the last assistant response
  useEffect(() => {
    if (messages.length === 0) {
      autoAttachedIdRef.current = null
      return
    }

    // Find the latest assistant message that has a report (SQL) and is finished (no status)
    const lastValidContext = [...messages]
      .reverse()
      .find(m => m.type === 'assistant' && m.reportData?.sql && !m.status)

    if (!lastValidContext) return

    // If we haven't auto-attached to this specific message yet AND there's no current replyToId
    if (!replyToId && autoAttachedIdRef.current !== lastValidContext.id) {
      setReplyTo(lastValidContext.id)
      autoAttachedIdRef.current = lastValidContext.id
    }
  }, [messages, replyToId, setReplyTo])

  const handleStop = () => {
    stopGeneration()

    const lastUserMsgIndex = [...messages]
      .reverse()
      .findIndex(m => m.type === 'user')

    if (lastUserMsgIndex !== -1) {
      const actualIndex = messages.length - 1 - lastUserMsgIndex
      const userMsg = messages[actualIndex]

      setValue(userMsg.content)
      valueRef.current = userMsg.content
      setInputDraft(userMsg.content)

      removeMessage(userMsg.id)

      if (actualIndex + 1 < messages.length) {
        const nextMsg = messages[actualIndex + 1]
        if (nextMsg.type === 'assistant') {
          removeMessage(nextMsg.id)
        }
      }

      textareaRef.current?.focus()
    }
  }

  const handleExportMarkdown = useCallback(async () => {
    checkGate('Markdown Export', async () => {
      try {
        addToast({
          title: t('export_triggered'),
          description: t('export_desc'),
          type: 'info',
          duration: 2000,
        })

        const content = generateMarkdown(messages)
        const sessionTitle = sanitizeFilename(activeSession?.title, 'Chat')
        const fileName = `${sessionTitle}_Export_${new Date().toISOString().slice(0, 10)}.md`

        const result = await window.electronAPI.saveFile({
          content,
          extension: 'md',
          name: fileName
        })

        if (result.success && result.data) {
          const filePath = result.data as string
          addToast({
            title: t('export_success_title'),
            description: filePath,
            type: 'success',
            action: {
              label: tCommon('open_folder', 'Open Folder'),
              onClick: () => window.electronAPI.showItemInFolder(filePath),
            },
          })
        } else if (result.error !== 'Cancelled') {
          throw new Error(result.error)
        }
      } catch (error) {
        console.error('Export failed', error)
        addToast({
          title: t('export_failed_title'),
          description: String(error),
          type: 'error',
        })
      }
    })
  }, [checkGate, addToast, t, messages, activeSession?.title, tCommon])

  const handleExportExcel = useCallback(async () => {
    checkGate('Excel Export', async () => {
      try {
        addToast({
          title: tCommon('export_generating_file'),
          description: tCommon('exporting_excel'),
          type: 'info',
          duration: 2000,
        })

        const insightLabels = {
          summary: tCommon('insight_summary'),
          findings: tCommon('insight_findings'),
          recommendation: tCommon('insight_recommendation')
        }

        const sheets = await collectExcelDataFromChat(messages, insightLabels)
        if (sheets.length === 0) {
          addToast({ title: tCommon('no_chart_data'), type: 'warning' })
          return
        }

        const sessionTitle = sanitizeFilename(activeSession?.title, 'Chat')
        const fileName = `${sessionTitle}_Export_${new Date().toISOString().slice(0, 10)}.xlsx`
        const result = await window.electronAPI.exportExcel({
          filename: fileName,
          sheets,
          insightTitle: tCommon('insights')
        })

        if (result.success && result.data) {
          const filePath = result.data as string
          addToast({
            title: tCommon('export_success'),
            description: filePath,
            type: 'success',
            action: {
              label: tCommon('open_folder'),
              onClick: () => window.electronAPI.showItemInFolder(filePath),
            },
          })
        } else if (result.error !== 'Cancelled') {
          throw new Error(result.error)
        }
      } catch (error) {
        console.error('Excel Export failed', error)
        addToast({
          title: tCommon('export_failed'),
          description: String(error),
          type: 'error',
        })
      }
    })
  }, [checkGate, addToast, tCommon, messages, activeSession?.title])

  const readyTables = useMemo(
    () => files.filter(f => f.status === 'ready'),
    [files]
  )

  const replyMessage = messages.find(m => m.id === replyToId)
  const replyPreview =
    replyMessage?.reportData?.title ||
    replyMessage?.content ||
    replyMessage?.reportData?.summary ||
    (replyMessage ? t('reply_fallback') : '')

  const contextPrompts = useMemo(() => {
    const raw = messages
      .filter(m => m.type === 'assistant' && m.reportData?.suggestions)
      .slice(-5)
      .flatMap(m => m.reportData?.suggestions || [])
    return Array.from(new Set(raw))
  }, [messages])

  const allPrompts = useMemo(() => {
    return Array.from(new Set([...suggestedPrompts, ...contextPrompts]))
  }, [suggestedPrompts, contextPrompts])

  const filteredTables = useMemo(() => {
    if (!mention.active) return []
    const q = mention.query.toLowerCase()
    return readyTables
      .filter(file => (file.name || '').toLowerCase().includes(q))
      .map(
        file => file.name || file.tableName || `table_${file.id.slice(0, 6)}`
      )
  }, [mention, readyTables])

  const commandQuery = value.startsWith('/') ? value.slice(1).toLowerCase() : ''

  const filteredCommands = useMemo(() => {
    if (!value.startsWith('/')) return []

    const cmds = [
      {
        id: 'sql',
        label: t('command_sql', 'Write SQL'),
        icon: Database,
        action: () => {
          setPopoverOpen(false)
          setValue('')
          setInputDraft('')
          valueRef.current = ''

          openSqlLab({
            mode: 'create',
            initialSql: '',
            onSave: async sql => {
              await addManualSqlMessage(sql)
            },
          })
        },
      },
      {
        id: 'clear',
        label: t('command_clear'),
        icon: Eraser,
        action: () => {
          resetChat()
          addToast({ title: t('chat_cleared'), type: 'info', duration: 2500 })
          setPopoverOpen(false)
          setValue('')
          setInputDraft('')
          valueRef.current = ''
        },
      },
      {
        id: 'refresh',
        label: t('command_refresh', 'Refresh Data'),
        icon: RefreshCw,
        action: async () => {
          setPopoverOpen(false)
          setValue('')
          setInputDraft('')
          valueRef.current = ''

          try {
            setRefreshing(true)
            await refreshSessionWidgets()
            addToast({
              title: tCommon('refresh_success'),
              type: 'success',
              duration: 2000,
            })
          } catch {
            addToast({
              title: tCommon('reload_failed'),
              description: tCommon('refresh_failed_desc'),
              type: 'error',
            })
          } finally {
            setRefreshing(false)
          }
        },
      },
      {
        id: 'export',
        label: t('export_markdown'),
        icon: isActivated ? Download : Lock,
        action: () => {
          handleExportMarkdown()
          setPopoverOpen(false)
          setValue('')
          setInputDraft('')
          valueRef.current = ''
        },
        className: !isActivated ? 'text-zinc-400' : '',
      },
      {
        id: 'export-excel',
        label: t('export_excel'),
        icon: isActivated ? FileSpreadsheet : Lock,
        action: () => {
          handleExportExcel()
          setPopoverOpen(false)
          setValue('')
          setInputDraft('')
          valueRef.current = ''
        },
        className: !isActivated ? 'text-zinc-400' : '',
      },
      {
        id: 'debug',
        label: t('debug_export_command'),
        icon: Bug,
        action: async () => {
          setPopoverOpen(false)
          setValue('')
          setInputDraft('')
          valueRef.current = ''
          const debugPath = await exportDebugLog()
          if (debugPath && debugPath !== 'browser-download') {
            addToast({
              title: tCommon('debug_export_success_toast'),
              description: debugPath,
              type: 'success',
              action: {
                label: tCommon('open_folder', 'Open Folder'),
                onClick: () => window.electronAPI.showItemInFolder(debugPath),
              },
            })
          } else {
            addToast({
              title: tCommon('debug_export_success_toast'),
              type: 'success',
            })
          }
        },
      },
    ]
    return cmds.filter(
      c =>
        c.id.includes(commandQuery) ||
        c.label.toLowerCase().includes(commandQuery)
    )
  }, [
    value,
    commandQuery,
    t,
    resetChat,
    addToast,
    handleExportMarkdown,
    handleExportExcel,
    isActivated,
    setInputDraft,
    tCommon,
    refreshSessionWidgets,
    setRefreshing,
    openSqlLab,
    addManualSqlMessage,
  ])

  const filteredCommandPrompts = useMemo(() => {
    if (!value.startsWith('/')) return []
    return allPrompts
      .filter(p => p.toLowerCase().includes(commandQuery))
      .slice(0, 10)
  }, [value, allPrompts, commandQuery])

  const commandListItems = useMemo(() => {
    return [...filteredCommands, ...filteredCommandPrompts]
  }, [filteredCommands, filteredCommandPrompts])

  const insertTableMention = (tableName: string) => {
    if (!mention.active) return
    const before = value.slice(0, mention.start)
    const after = value.slice(cursorPosition)
    const insertion = `@${tableName} `
    const nextValue = `${before}${insertion}${after}`
    const newCursor = before.length + insertion.length
    setValue(nextValue)
    setMention({ active: false })
    setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(newCursor, newCursor)
      setCursorPosition(newCursor)
    }, 0)
  }

  const insertPrompt = (prompt: string) => {
    setValue(prompt)
    setTriggerType(null)
    setPopoverOpen(false)
    textareaRef.current?.focus()
  }

  const handleSubmit = async () => {
    const trimmed = value.trim()
    if (!trimmed || loading) return

    if (trimmed.startsWith('/')) {
      const cmd = trimmed.slice(1).toLowerCase()
      if (['clear', 'export', 'export-excel', 'debug', 'refresh'].includes(cmd)) {
        if (cmd === 'clear') {
          resetChat()
          addToast({ title: t('chat_cleared'), type: 'info', duration: 2500 })
        }
        if (cmd === 'refresh') {
          try {
            setRefreshing(true)
            await refreshSessionWidgets()
            addToast({
              title: tCommon('refresh_success'),
              type: 'success',
              duration: 2000,
            })
          } catch {
            addToast({
              title: tCommon('reload_failed'),
              description: tCommon('refresh_failed_desc'),
              type: 'error',
            })
          } finally {
            setRefreshing(false)
          }
        }
        if (cmd === 'export') {
          handleExportMarkdown()
        }
        if (cmd === 'export-excel') {
          handleExportExcel()
        }
        if (cmd === 'debug') {
          const debugPath = await exportDebugLog()
          if (debugPath && debugPath !== 'browser-download') {
              addToast({ 
                  title: t('debug_export_success_toast'), 
                  description: debugPath,
                  type: 'success',
                  action: {
                      label: tCommon('open_folder', 'Open Folder'),
                      onClick: () => window.electronAPI.showItemInFolder(debugPath)
                  }
              })
          } else {
              addToast({ title: t('debug_export_success_toast'), type: 'success' })
          }
        }
        setValue('')
        setInputDraft('')
        valueRef.current = ''
        return
      }
    }

    onSubmit(trimmed)
    setValue('')
    setInputDraft('')
    valueRef.current = ''
  }

  const handleToggleCommands = () => {
    if (value.startsWith('/')) {
      const next = value.slice(1)
      setValue(next)
      valueRef.current = next
      setCursorPosition(0)
      setTimeout(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(0, 0)
      }, 0)
    } else {
      const next = '/' + value
      setValue(next)
      valueRef.current = next
      setTriggerType('command')
      setPopoverOpen(true)
      setCursorPosition(1)
      setTimeout(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(1, 1)
      }, 0)
    }
  }

  const handleToggleMention = () => {
    if (value.endsWith('@')) return

    const insertion = value && !value.endsWith(' ') ? ' @' : '@'
    const next = value + insertion
    const nextCursor = next.length

    setValue(next)
    valueRef.current = next
    setTriggerType('table')
    setPopoverOpen(true)
    setCursorPosition(nextCursor)

    setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    }, 0)
  }

  const detectMention = (text: string, caret: number): MentionState => {
    const before = text.slice(0, caret)
    const match = before.match(/(?:^|\s)@([\w-]*)$/)
    if (!match) return { active: false }
    const query = match[1] || ''
    const start =
      match.index !== undefined ? match.index + match[0].indexOf('@') : caret
    return { active: true, start, query }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return

    if (triggerType === 'table' && filteredTables.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => (i + 1) % filteredTables.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(
          i => (i - 1 + filteredTables.length) % filteredTables.length
        )
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        insertTableMention(filteredTables[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        setMention({ active: false })
        setPopoverOpen(false)
        return
      }
    }

    if (triggerType === 'command' && commandListItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => (i + 1) % commandListItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(
          i => (i - 1 + commandListItems.length) % commandListItems.length
        )
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const item = commandListItems[mentionIndex]
        if (typeof item === 'string') {
          insertPrompt(item)
        } else {
          item.action()
        }
        return
      }
      if (e.key === 'Escape') {
        setTriggerType(null)
        setPopoverOpen(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  useEffect(() => {
    const isFocused = document.activeElement === textareaRef.current
    const nextMention = detectMention(value, cursorPosition)
    setMention(nextMention)
    setMentionIndex(0)

    const lastChar = value[value.length - 1]

    // Only auto-open popover if the input is focused (user is actively typing)
    if (isFocused) {
        if (lastChar === '@' || nextMention.active) {
            setTriggerType('table')
            setPopoverOpen(true)
            return
        }

        if (value.startsWith('/')) {
            setTriggerType('command')
            setPopoverOpen(true)
            return
        }
    }

    // If not focused or no trigger condition met, we only keep it open if it was already open 
    // (e.g. user clicked the button which might briefly blur the input)
    // But for safety on app start, if value is empty or doesn't match trigger, close it.
    if (!value.startsWith('/') && !nextMention.active && lastChar !== '@') {
        setTriggerType(null)
        setPopoverOpen(false)
    }
  }, [value, cursorPosition])

  // Force re-calculation of textarea height when container width changes (e.g. sidebar toggle)
  const lastWidthRef = useRef(0)
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      
      const width = Math.round(entry.contentRect.width)
      if (width !== lastWidthRef.current) {
        lastWidthRef.current = width
        // TextareaAutosize listens to window resize. Triggering it manually 
        // ensures height is recalculated when the available width changes.
        window.dispatchEvent(new Event('resize'))
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const hasContent = value.trim().length > 0

  return (
    <div className={cn('relative w-full flex justify-center', className)}>
      {gateNode}
      <div ref={containerRef} className="relative w-full max-w-2xl">
        {replyToId && replyMessage && (
          <div className="absolute top-0 left-4 right-4 -translate-y-full bg-zinc-50 border border-b-0 rounded-t-xl px-3 py-2 text-xs flex items-center justify-between z-[55] shadow-sm animate-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 text-zinc-600 min-w-0">
              <CornerDownRight className="h-3 w-3" />
              <span className="text-[10px] font-bold uppercase tracking-tight text-zinc-500">
                {t('refining')}
              </span>
              <span className="truncate flex-1 min-w-0 italic text-zinc-600">
                {replyPreview}
              </span>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="hover:bg-zinc-200 p-1 rounded transition-colors text-zinc-400 hover:text-zinc-600"
              aria-label="Cancel reply"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {popoverOpen && (
          <div className="absolute -top-2 left-4 right-4 transform -translate-y-full mb-2 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden z-[60]">
            <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-100 text-xs font-medium text-zinc-500 flex items-center gap-2">
              {triggerType === 'command' ? (
                <>
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  {t('command_suggestions')}
                </>
              ) : (
                <>
                  <Database className="w-3 h-3" />
                  {tCommon('select_table')}
                </>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {triggerType === 'table' &&
                filteredTables.map((table, idx) => (
                  <button
                    key={table}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors',
                      idx === mentionIndex
                        ? 'bg-orange-50 text-orange-900'
                        : 'hover:bg-zinc-100 text-zinc-700'
                    )}
                    onClick={() => insertTableMention(table)}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-orange-400" />
                    <span className="truncate">{table}</span>
                  </button>
                ))}

              {triggerType === 'command' && (
                <>
                  {filteredCommands.map((cmd, idx) => (
                    <button
                      key={cmd.id}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors',
                        idx === mentionIndex
                          ? 'bg-zinc-100 text-zinc-900'
                          : 'hover:bg-zinc-50 text-zinc-700'
                      )}
                      onClick={cmd.action}
                    >
                      <cmd.icon className="w-4 h-4 text-zinc-500" />
                      {cmd.label}
                    </button>
                  ))}

                  {filteredCommands.length > 0 &&
                    filteredCommandPrompts.length > 0 && (
                      <div className="h-px bg-zinc-100 my-1 mx-2" />
                    )}

                  {filteredCommandPrompts.map((prompt, idx) => {
                    const realIdx = idx + filteredCommands.length
                    return (
                      <button
                        key={prompt}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-md text-sm flex items-start gap-2 transition-colors',
                          realIdx === mentionIndex
                            ? 'bg-indigo-50 text-indigo-900'
                            : 'hover:bg-zinc-50 text-zinc-700'
                        )}
                        onClick={() => insertPrompt(prompt)}
                      >
                        <Sparkles className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{prompt}</span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        )}

        <div
          className={cn(
            'w-full rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all duration-300 flex flex-col overflow-hidden',
            'focus-within:shadow-xl focus-within:border-indigo-200 focus-within:ring-1 focus-within:ring-indigo-100'
          )}
        >
          <div className="px-4 pt-3 pb-1">
            <TextareaAutosize
              ref={textareaRef}
              minRows={1}
              maxRows={8}
              placeholder={placeholder}
              className="w-full resize-none bg-transparent border-none shadow-none outline-none focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-base text-zinc-900 placeholder:text-zinc-400 placeholder:whitespace-nowrap leading-relaxed"
              value={value}
              onChange={e => {
                setValue(e.target.value)
                setCursorPosition(e.target.selectionStart)
              }}
              onSelect={e => setCursorPosition(e.currentTarget.selectionStart)}
              onKeyDown={handleKeyDown}
              disabled={loading || isRestoring}
            />
          </div>

          <div className="px-3 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleToggleCommands}
                className={cn(
                  'h-8 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-200 text-[11px] font-bold border shadow-sm',
                  value.startsWith('/')
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-100'
                    : 'bg-white text-zinc-500 border-zinc-200 hover:border-indigo-300 hover:text-indigo-600'
                )}
              >
                <span className="font-mono text-sm">/</span>
                <span>{t('command_suggestions')}</span>
              </button>
              <button
                onClick={handleToggleMention}
                className={cn(
                  'h-8 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-200 text-[11px] font-bold border shadow-sm',
                  mention.active
                    ? 'bg-orange-500 text-white border-orange-500 shadow-orange-100'
                    : 'bg-white text-zinc-500 border-zinc-200 hover:border-orange-300 hover:text-orange-600'
                )}
              >
                <span className="font-mono text-sm">@</span>
                <span>{tCommon('data_sources_root')}</span>
              </button>

              {isRestoring && (
                <>
                    <div className="ml-2 h-4 w-px bg-zinc-100" />
                    <div className="ml-2 text-[10px] text-zinc-400 italic opacity-60">
                        {t('restoring_session')}
                    </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {loading ? (
                <button
                  onClick={handleStop}
                  className="h-8 w-8 rounded-full flex items-center justify-center transition-all duration-200 bg-red-50 hover:bg-red-100 active:scale-95"
                  aria-label="Stop generation"
                  title={t('stop_generation')}
                >
                  <Square className="w-3 h-3 fill-current text-red-500" />
                </button>
              ) : isRestoring ? (
                <div className="h-8 w-8 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                </div>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!hasContent}
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center transition-all duration-200',
                    hasContent
                      ? 'bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95'
                      : 'bg-zinc-50 text-zinc-300 cursor-not-allowed'
                  )}
                  aria-label="Send message"
                >
                  <ArrowUp className="w-4 h-4 stroke-[3]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
