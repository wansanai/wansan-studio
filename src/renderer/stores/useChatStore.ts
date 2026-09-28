import { useProjectStore } from './useProjectStore'
import { useSettingsStore } from './useSettingsStore'
import { useToastStore } from './useToastStore'
import { Analytics } from '../services/analytics'
import type { ChatMessage } from '../components/ChatInterface'
import type {
  AIAnalysisResult,
  TableSchema,
  InsightResult,
} from '@shared/types'
import type { ReportData } from '@shared/types/dashboard'
import { FilterParam } from '@shared/schemas/analysis'
import i18n from '../i18n'
import { mapFileToSchema } from '../utils/schema-mapper'

// Types
interface ChatStore {
  messages: ChatMessage[]
  history: ChatMessage[]
  replyToId: string | null
  abortController: AbortController | null
  setReplyTo: (id: string | null) => void
  updateMessage: (
    id: string,
    updater: (message: ChatMessage) => ChatMessage
  ) => void
  updateMessageData: (
    messageId: string,
    newSql: string,
    newData: Record<string, unknown>[],
    columnFields: Array<{ name: string; type: string }>
  ) => void
  updateMessageInsight: (messageId: string, insight?: InsightResult) => void
  sendMessage: (
    text: string,
    hiddenPrompt?: string,
    schemas?: TableSchema[],
    languageOverride?: 'en' | 'zh'
  ) => Promise<void>
  retryMessage: (messageId: string, originalQuery: string) => Promise<void>
  rerunAnalysis: (originalMessage: ChatMessage) => Promise<void>
  autoFixMessage: (
    messageId: string,
    error: string,
    originalQuery?: string,
    originalSql?: string
  ) => Promise<void>
  updateReportConfig: (
    id: string,
    updates: {
      viz_type?: AIAnalysisResult['viz_type']
      viz_config?: AIAnalysisResult['viz_config']
    }
  ) => void
  reset: () => void
  // Methods for UI state control
  resetLoading: () => void
  removeMessage: (id: string) => void
  stopGeneration: () => void
  runTemplateSQL: (
    messageId: string,
    sql: string,
    selectedParams?: Record<string, string[]>
  ) => Promise<void>
  addManualSqlMessage: (sql: string) => Promise<void>
}

const generateId = () => crypto.randomUUID()

const resolveMentions = (text: string) => {
  const files = useProjectStore.getState().files
  if (!files.length) return text

  return text.replace(
    /@(?:"([^"]+)"|'([^']+)'|([^\s]+))/g,
    (match, g1, g2, g3) => {
      const name = g1 || g2 || g3
      if (!name) return match
      const file = files.find(f => f.name === name)
      if (file) {
        const tableName = file.tableName || file.name || match
        return `"${tableName}"`
      }
      return match
    }
  )
}

// Helper to get active session state safely
const getSessionState = () => {
  const projectState = useProjectStore.getState()
  const session = projectState.sessions.find(
    s => s.id === projectState.activeSessionId
  )

  const resolvedMessages = (session?.messages || []).map(m => {
    if (m.widgetId && projectState.widgetRegistry[m.widgetId]) {
      return { ...m, reportData: projectState.widgetRegistry[m.widgetId] }
    }
    return m
  })

  return {
    projectState,
    session,
    messages: resolvedMessages as ChatMessage[],
    replyToId: session?.replyToId || null,
    abortController:
      projectState.abortControllers[projectState.activeSessionId] || null,
  }
}

// --- Actions Implementation ---

const updateMessage = (
  id: string,
  updater: (message: ChatMessage) => ChatMessage
) => {
  const { messages } = getSessionState()
  const msg = messages.find(m => m.id === id)
  if (msg) {
    useProjectStore.getState().updateMessage(id, updater(msg) as any)
  }
}

const updateReportConfig = (
  id: string,
  updates: {
    viz_type?: AIAnalysisResult['viz_type']
    viz_config?: AIAnalysisResult['viz_config']
  }
) => {
  updateMessage(id, msg => {
    if (!msg.reportData) return msg
    const nextVizConfig =
      updates.viz_config !== undefined
        ? { ...msg.reportData.vizConfig, ...updates.viz_config }
        : msg.reportData.vizConfig

    return {
      ...msg,
      reportData: {
        ...msg.reportData,
        chartType: updates.viz_type ?? msg.reportData.chartType,
        vizConfig: nextVizConfig,
      },
    }
  })
}

const updateMessageData = (
  id: string,
  newSql: string,
  newData: Record<string, unknown>[],
  columnFields: Array<{ name: string; type: string }>
) => {
  updateMessage(id, msg => {
    // We update the data even if reportData is missing (might have been cleared)
    const existingReportData = (msg.reportData || {}) as Partial<ReportData>
    return {
      ...msg,
      status: undefined, // Clear error status
      error: undefined, // Clear error message
      reportData: {
        ...existingReportData,
        title: existingReportData.title || '',
        sql: newSql,
        tableData: newData,
        columnFields,
      } as ReportData,
    }
  })
}

const updateMessageInsight = (messageId: string, insight?: InsightResult) => {
  updateMessage(messageId, msg => {
    if (!msg.reportData) return msg
    return {
      ...msg,
      reportData: {
        ...msg.reportData,
        insight,
        insightTime: Date.now(),
      },
    }
  })
}

const resetLoading = () => {
  const { session } = getSessionState()
  if (!session) return

  // Clear abort controller
  useProjectStore.getState().setAbortController(null)

  // Mark loading messages as error
  session.messages.forEach(m => {
    if (
      m.status === 'thinking' ||
      m.status === 'planning' ||
      m.status === 'executing'
    ) {
      useProjectStore.getState().updateMessage(m.id, {
        status: 'error',
        error: i18n.t('interrupted_retry', { ns: 'chat' }),
      })
    }
  })
}

const stopGeneration = () => {
  const { abortController } = getSessionState()
  if (abortController) {
    abortController.abort()
  }
  resetLoading()
}

const sendMessage = async (
  text: string,
  hiddenPrompt?: string,
  schemas?: TableSchema[],
  languageOverride?: 'en' | 'zh'
) => {
  const { messages, replyToId } = getSessionState()
  const fileState = useProjectStore.getState()
  const language =
    languageOverride || useSettingsStore.getState().language || 'en'
  const readyFiles = fileState.files.filter(f => f.status === 'ready')
  const { provider } = useSettingsStore.getState()

  // API Key Check
  let apiKey: string | undefined
  try {
    const configRes = await window.electronAPI.getAIConfig()
    if (configRes.success && configRes.data) {
      apiKey = configRes.data.apiKey
    }
  } catch (e) {
    console.error('Failed to check AI config', e)
  }

  if (!apiKey && provider !== 'custom') {
    const botMsgId = generateId()
    // Add User Msg
    useProjectStore.getState().addMessage({
      id: generateId(),
      type: 'user',
      content: text,
      timestamp: Date.now(),
    } as any)

    // Add Error Msg
    useProjectStore.getState().addMessage({
      id: botMsgId,
      type: 'assistant',
      content: '',
      status: 'error',
      error: 'ERR_NO_API_KEY',
      timestamp: Date.now() + 1,
    } as any)
    return
  }

  // Abort Controller
  const abortController = new AbortController()
  useProjectStore.getState().setAbortController(abortController)

  const resolvedSchemas =
    schemas ?? readyFiles.map(f => mapFileToSchema(f, fileState.files))

  // Determine Context
  const manualContextMsg =
    replyToId &&
    messages.find(
      m => m.id === replyToId && m.type === 'assistant' && m.reportData?.sql
    )
  const autoContextMsg =
    !manualContextMsg &&
    [...messages]
      .reverse()
      .find(m => m.type === 'assistant' && m.reportData?.sql)
  const selectedContext = manualContextMsg || autoContextMsg
  let context: { lastSql: string; lastQuery: string } | undefined

  if (selectedContext?.type === 'assistant' && selectedContext.reportData) {
    const selectedIndex = messages.findIndex(m => m.id === selectedContext.id)
    const precedingUser = [...messages]
      .slice(0, selectedIndex)
      .reverse()
      .find(m => m.type === 'user')
    context = {
      lastSql: selectedContext.reportData.sql || '',
      lastQuery: precedingUser?.content || '',
    }
  }

  const userMsgId = generateId()
  const botMsgId = generateId()

  // Optimistic Update
  useProjectStore.getState().addMessage({
    id: userMsgId,
    type: 'user',
    content: text,
    hiddenPrompt,
    timestamp: Date.now(),
  } as any)

  useProjectStore.getState().addMessage({
    id: botMsgId,
    type: 'assistant',
    content: '',
    timestamp: Date.now() + 1,
    status: 'thinking',
    originalQuery: text,
  } as any)

  // Clear replyToId
  useProjectStore.getState().setReplyTo(null)

  try {
    if (abortController.signal.aborted)
      throw new Error('Generation aborted by user')

    const resolvedPrompt = resolveMentions(hiddenPrompt || text)
    const globalRules = useSettingsStore.getState().domainRules || []
    const projectRules = useProjectStore.getState().domainRules || []
    const combinedRules = [...globalRules, ...projectRules]
    const suggestionCount = useSettingsStore.getState().suggestionCount

    const aiStartTime = Date.now()
    const planResponse = await window.electronAPI.askAI({
      userQuery: resolvedPrompt,
      schemas: resolvedSchemas,
      context,
      language,
      domainRules: combinedRules,
      suggestionCount,
    })
    const aiLatency = Date.now() - aiStartTime

    if (abortController.signal.aborted)
      throw new Error('Generation aborted by user')
    if (!planResponse.success || !planResponse.data)
      throw new Error(planResponse.error || 'AI request failed')

    const plan = planResponse.data
    if (plan.status === 'error' || !plan.sql)
      throw new Error(plan.error || 'AI returned an error')

    if (plan.is_template) {
      updateMessage(botMsgId, msg => ({
        ...msg,
        metadata: { aiLatency },
        reportData: {
          title: plan.title,
          summary: plan.summary,
          sql: plan.sql,
          template_sql: plan.sql, // Store the raw template here
          reasoning: plan.reasoning,
          suggestions: plan.suggestions,
          chartType: plan.viz_type,
          vizConfig: plan.viz_config as any,
          is_template: plan.is_template,
          missing_params: plan.missing_params as any,
        },
      }))
    }

    if (plan.is_template && plan.missing_params) {
      try {
        const { sql: finalSql, params: selectedParams } = await new Promise<{
          sql: string
          params: Record<string, string[]>
        }>((resolve, reject) => {
          useProjectStore.getState().setSmartFilterRequest({
            isOpen: true,
            params: plan.missing_params as FilterParam[],
            templateSql: plan.sql!,
            resolve,
            reject,
          })
        })
        plan.sql = finalSql
        // Store selected params in reportData for persistence
        updateMessage(botMsgId, msg => ({
          ...msg,
          reportData: {
            ...msg.reportData!,
            selected_params: selectedParams,
          },
        }))
        useProjectStore.getState().setSmartFilterRequest(null)
      } catch (e) {
        useProjectStore.getState().setSmartFilterRequest(null)
        throw e // Propagate error (cancellation)
      }
    }

    Analytics.track('analysis_generated', {
      viz_type: plan.viz_type || 'unknown',
      is_template: plan.is_template || false,
      missing_params_count: plan.missing_params?.length || 0,
      ai_latency: aiLatency,
    })

    const refinementHint =
      (plan.reasoning || '').toLowerCase().includes('modified previous sql') ||
      !!context
    const contextRef =
      refinementHint && context
        ? { query: context.lastQuery, sqlSummary: context.lastSql }
        : undefined

    updateMessage(botMsgId, msg => ({
      ...msg,
      status: 'planning',
      planSql: plan.sql,
      planReasoning: plan.reasoning,
      contextRef,
      metadata: { ...msg.metadata, aiLatency },
    }))

    if (abortController.signal.aborted)
      throw new Error('Generation aborted by user')

    updateMessage(botMsgId, msg => ({ ...msg, status: 'executing' }))

    const dbStartTime = Date.now()
    const execution = await window.electronAPI.runSQL(plan.sql)
    const dbLatency = Date.now() - dbStartTime

    if (!execution.success || !execution.data) {
      throw new Error(execution.error || 'SQL execution failed')
    }

    updateMessage(botMsgId, msg => ({
      ...msg,
      status: undefined,
      content: plan.summary || '',
      metadata: { aiLatency, dbLatency, latency: aiLatency + dbLatency },
      reportData: {
        title: plan.title,
        summary: plan.summary,
        sql: plan.sql,
        reasoning: plan.reasoning,
        suggestions: plan.suggestions,
        chartType: plan.viz_type,
        tableData: execution.data.data,
        columnFields: execution.data.columnFields,
        vizConfig: plan.viz_config as any,
        is_template: plan.is_template,
        missing_params: plan.missing_params as any,
      },
    }))

    // Auto-rename session if it's "New Session"
    const activeSessionId = useProjectStore.getState().activeSessionId
    const session = useProjectStore
      .getState()
      .sessions.find(s => s.id === activeSessionId)
    if (session && session.title === 'New Session' && plan.title) {
      useProjectStore.getState().renameSession(activeSessionId, plan.title)
    }

    useProjectStore.getState().setAbortController(null)
  } catch (error: any) {
    if (error?.message === 'Cancelled') {
      updateMessage(botMsgId, msg => ({
        ...msg,
        status: undefined,
        error: undefined,
      }))
      useProjectStore.getState().setAbortController(null)
      return
    }

    Analytics.track('analysis_generated', {
      status: 'error',
      error_type: 'execution_failed',
    })

    updateMessage(botMsgId, msg => ({
      ...msg,
      status: 'error',
      error: error?.message || 'Unknown error',
    }))
    useProjectStore.getState().setAbortController(null)
  }
}

const retryMessage = async (messageId: string, originalQuery: string) => {
  const { messages } = getSessionState()
  const fileState = useProjectStore.getState()
  const language = useSettingsStore.getState().language || 'en'
  const readyFiles = fileState.files.filter(f => f.status === 'ready')

  const targetMsgIndex = messages.findIndex(m => m.id === messageId)
  if (targetMsgIndex === -1) return

  // Reset message status
  updateMessage(messageId, msg => ({
    ...msg,
    status: 'thinking',
    error: undefined,
    content: '',
    reportData: undefined,
  }))

  const abortController = new AbortController()
  useProjectStore.getState().setAbortController(abortController)

  const schemas = readyFiles.map(f => mapFileToSchema(f, fileState.files))

  const precedingMessages = messages.slice(0, targetMsgIndex)
  const contextMsg = [...precedingMessages]
    .reverse()
    .find(m => m.type === 'assistant' && m.reportData?.sql)

  let context: { lastSql: string; lastQuery: string } | undefined
  if (contextMsg?.type === 'assistant' && contextMsg.reportData) {
    const contextIndex = messages.findIndex(m => m.id === contextMsg.id)
    const precedingUser = [...messages]
      .slice(0, contextIndex)
      .reverse()
      .find(m => m.type === 'user')
    context = {
      lastSql: contextMsg.reportData.sql || '',
      lastQuery: precedingUser?.content || '',
    }
  }

  try {
    if (abortController.signal.aborted)
      throw new Error('Generation aborted by user')

    const resolvedPrompt = resolveMentions(originalQuery)
    const globalRules = useSettingsStore.getState().domainRules || []
    const projectRules = useProjectStore.getState().domainRules || []
    const combinedRules = [...globalRules, ...projectRules]
    const suggestionCount = useSettingsStore.getState().suggestionCount

    const aiStartTime = Date.now()
    const planResponse = await window.electronAPI.askAI({
      userQuery: resolvedPrompt,
      schemas,
      context,
      language,
      domainRules: combinedRules,
      suggestionCount,
    })
    const aiLatency = Date.now() - aiStartTime

    if (abortController.signal.aborted)
      throw new Error('Generation aborted by user')
    if (!planResponse.success || !planResponse.data)
      throw new Error(planResponse.error || 'AI request failed')

    const plan = planResponse.data
    if (plan.status === 'error' || !plan.sql)
      throw new Error(plan.error || 'AI returned an error')

    if (plan.is_template) {
      updateMessage(messageId, msg => ({
        ...msg,
        metadata: { ...msg.metadata, aiLatency },
        reportData: {
          title: plan.title,
          summary: plan.summary,
          sql: plan.sql,
          reasoning: plan.reasoning,
          suggestions: plan.suggestions,
          chartType: plan.viz_type,
          vizConfig: plan.viz_config as any,
          is_template: plan.is_template,
          missing_params: plan.missing_params as any,
        },
      }))
    }

    if (plan.is_template && plan.missing_params) {
      try {
        const { sql: finalSql, params: selectedParams } = await new Promise<{
          sql: string
          params: Record<string, string[]>
        }>((resolve, reject) => {
          useProjectStore.getState().setSmartFilterRequest({
            isOpen: true,
            params: plan.missing_params as FilterParam[],
            templateSql: plan.sql!,
            resolve,
            reject,
          })
        })
        plan.sql = finalSql
        // Store selected params in reportData for persistence
        updateMessage(messageId, msg => ({
          ...msg,
          reportData: {
            ...msg.reportData!,
            selected_params: selectedParams,
          },
        }))
        useProjectStore.getState().setSmartFilterRequest(null)
      } catch (e) {
        useProjectStore.getState().setSmartFilterRequest(null)
        throw e // Propagate error (cancellation)
      }
    }

    Analytics.track('analysis_generated', {
      viz_type: plan.viz_type || 'unknown',
      is_template: plan.is_template || false,
      missing_params_count: plan.missing_params?.length || 0,
      ai_latency: aiLatency,
    })

    updateMessage(messageId, msg => ({
      ...msg,
      status: 'planning',
      planSql: plan.sql,
      planReasoning: plan.reasoning,
      metadata: { ...msg.metadata, aiLatency },
    }))

    if (abortController.signal.aborted)
      throw new Error('Generation aborted by user')
    updateMessage(messageId, msg => ({ ...msg, status: 'executing' }))

    const dbStartTime = Date.now()
    const execution = await window.electronAPI.runSQL(plan.sql)
    const dbLatency = Date.now() - dbStartTime

    if (!execution.success || !execution.data) {
      throw new Error(execution.error || 'SQL execution failed')
    }

    updateMessage(messageId, msg => ({
      ...msg,
      status: undefined,
      content: plan.summary || '',
      metadata: { aiLatency, dbLatency, latency: aiLatency + dbLatency },
      reportData: {
        title: plan.title,
        summary: plan.summary,
        sql: plan.sql,
        reasoning: plan.reasoning,
        suggestions: plan.suggestions,
        chartType: plan.viz_type,
        tableData: execution.data.data,
        columnFields: execution.data.columnFields,
        vizConfig: plan.viz_config as any,
        is_template: plan.is_template,
        missing_params: plan.missing_params as any,
      },
    }))
    useProjectStore.getState().setAbortController(null)
  } catch (error: any) {
    if (error?.message === 'Cancelled') {
      updateMessage(messageId, msg => ({
        ...msg,
        status: undefined,
        content: i18n.t('analysis_cancelled', {
          ns: 'chat',
          defaultValue: 'Analysis cancelled.',
        }),
        error: undefined,
      }))
      useProjectStore.getState().setAbortController(null)
      return
    }

    Analytics.track('analysis_generated', {
      status: 'error',
      error_type: 'execution_failed',
    })
    updateMessage(messageId, msg => ({
      ...msg,
      status: 'error',
      error: error?.message || 'Unknown error',
    }))
    useProjectStore.getState().setAbortController(null)
  }
}

const rerunAnalysis = async (originalMessage: ChatMessage) => {
  if (!originalMessage.originalQuery) {
    useToastStore.getState().addToast({
      type: 'error',
      title: i18n.t('error_cannot_rerun_title', { ns: 'chat' }),
      description: i18n.t('error_cannot_rerun_desc', { ns: 'chat' }),
      duration: 4000,
    })
    return
  }
  await sendMessage(originalMessage.originalQuery)
}

const autoFixMessage = async (
  messageId: string,
  error: string,
  originalQuery?: string,
  originalSql?: string
) => {
  const { messages } = getSessionState()
  const message = messages.find(m => m.id === messageId)
  if (!message) return

  // Prefer fixing the template to preserve parameters flexibility
  const sqlToFix = message.reportData?.template_sql || originalSql

  updateMessage(messageId, msg => ({
    ...msg,
    status: 'executing',
  }))

  try {
    const fileState = useProjectStore.getState()
    const readyFiles = fileState.files.filter(f => f.status === 'ready')
    const schemas = readyFiles.map(f => mapFileToSchema(f, fileState.files))

    if (!sqlToFix)
      throw new Error(i18n.t('error_no_sql_to_fix', { ns: 'chat' }))

    const globalRules = useSettingsStore.getState().domainRules || []
    const projectRules = useProjectStore.getState().domainRules || []
    const combinedRules = [...globalRules, ...projectRules]

    const fixResult = await window.electronAPI.fixSQL({
      originalSql: sqlToFix,
      error,
      schemas,
      domainRules: combinedRules,
    })
    if (!fixResult.success || !fixResult.data)
      throw new Error(
        fixResult.error || i18n.t('error_failed_to_fix_sql', { ns: 'chat' })
      )

    const { sql: fixedSql, reasoning, is_template, missing_params } = fixResult.data
    let finalSql = fixedSql
    let selectedParams: Record<string, string[]> | undefined

    // Scenario 1: AI returned a template (preserved or new)
    if (is_template && missing_params) {
        // Try to reuse existing params if they match
        const existingParams = message.reportData?.selected_params || {}
        // If parameters changed (unlikely for a fix, but possible), we might need re-confirmation.
        // For now, we assume if placeholders match, we reuse values.

        // Auto-fill template with existing values if available
        let filledSql = fixedSql
        let allParamsFilled = true

        missing_params.forEach(p => {
            const vals = existingParams[p.placeholder]
            if (vals && vals.length > 0) {
                 const sqlList = vals.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')
                 const escapedPlaceholder = p.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                 const regex = new RegExp(`'${escapedPlaceholder}'|${escapedPlaceholder}`, 'g')
                 filledSql = filledSql.replace(regex, sqlList)
            } else {
                allParamsFilled = false
            }
        })

        if (allParamsFilled) {
            finalSql = filledSql
            selectedParams = existingParams
        } else {
            // Fallback: Ask user to fill missing params (rare in fix flow)
             try {
                const resolved = await new Promise<{
                sql: string
                params: Record<string, string[]>
                }>((resolve, reject) => {
                useProjectStore.getState().setSmartFilterRequest({
                    isOpen: true,
                    params: missing_params as FilterParam[],
                    templateSql: fixedSql,
                    resolve,
                    reject,
                })
                })
                finalSql = resolved.sql
                selectedParams = resolved.params
                useProjectStore.getState().setSmartFilterRequest(null)
            } catch (e) {
                useProjectStore.getState().setSmartFilterRequest(null)
                throw e
            }
        }
    }
    // Scenario 2: AI returned a template but we treated it as a regular fix (fallback logic)
    // or Scenario 3: AI stripped the template and returned a hardcoded SQL (downgrade)

    const execution = await window.electronAPI.runSQL(finalSql)
    if (!execution.success || !execution.data)
      throw new Error(
        execution.error ||
          i18n.t('error_fixed_sql_execution_failed', { ns: 'chat' })
      )

    const { data, columnFields } = execution.data

    updateMessage(messageId, msg => ({
      ...msg,
      status: undefined,
      error: undefined,
      reportData: {
        title: msg.reportData?.title || 'Auto-fix Result', // Fallback title
        ...(msg.reportData || {}),
        sql: finalSql,
        template_sql: is_template ? fixedSql : msg.reportData?.template_sql, // Preserve template if returned or exists
        reasoning:
          (msg.planReasoning ? msg.planReasoning + '\n\n' : '') +
          i18n.t('autofix_reasoning', { ns: 'chat', reasoning }),
        tableData: data,
        columnFields,
        chartType: msg.reportData?.chartType || 'table',
        is_template,
        missing_params: missing_params as any,
        selected_params: selectedParams,
      },
    }))
    useToastStore.getState().addToast({
      type: 'success',
      title: i18n.t('autofix_success_toast_title', { ns: 'chat' }),
      duration: 3000,
    })
  } catch (error: any) {
    updateMessage(messageId, msg => ({
      ...msg,
      status: 'error',
      error: error?.message || i18n.t('error_unknown', { ns: 'chat' }),
    }))
    useToastStore.getState().addToast({
      type: 'error',
      title: i18n.t('autofix_failed_toast_title', { ns: 'chat' }),
      description:
        error?.message || i18n.t('autofix_failed_toast_desc', { ns: 'chat' }),
      duration: 4000,
    })
  }
}

const runTemplateSQL = async (
  messageId: string,
  sql: string,
  selectedParams?: Record<string, string[]>
) => {
  const startTime = Date.now()
  const abortController = new AbortController()
  useProjectStore.getState().setAbortController(abortController)

  updateMessage(messageId, msg => ({ ...msg, status: 'executing' }))

  try {
    const execution = await window.electronAPI.runSQL(sql)
    if (!execution.success || !execution.data)
      throw new Error(execution.error || 'SQL execution failed')

    const { data, columnFields } = execution.data
    const dbLatency = Date.now() - startTime

    updateMessage(messageId, msg => ({
      ...msg,
      status: undefined,
      metadata: {
        ...msg.metadata,
        aiLatency: msg.metadata?.aiLatency || 0,
        dbLatency,
        latency: (msg.metadata?.aiLatency || 0) + dbLatency,
      },
      reportData: {
        ...msg.reportData!,
        sql,
        tableData: data,
        columnFields,
        selected_params: selectedParams || msg.reportData?.selected_params,
      },
    }))
    useProjectStore.getState().setAbortController(null)
  } catch (error: any) {
    updateMessage(messageId, msg => ({
      ...msg,
      status: 'error',
      error: error?.message || 'Unknown error',
    }))
    useProjectStore.getState().setAbortController(null)
  }
}

const addManualSqlMessage = async (sql: string) => {
  const userMsgId = generateId()
  const botMsgId = generateId()

  // 1. Add User Message (The SQL)
  useProjectStore.getState().addMessage({
    id: userMsgId,
    type: 'user',
    content: i18n.t('sql_query_submitted', { ns: 'chat' }), // Display a user-friendly message
    timestamp: Date.now(),
  } as any)

  // 2. Add Assistant Placeholder
  useProjectStore.getState().addMessage({
    id: botMsgId,
    type: 'assistant',
    content: '',
    status: 'executing',
    timestamp: Date.now() + 1,
  } as any)

  // 3. Execute SQL
  try {
    const startTime = Date.now()
    const execution = await window.electronAPI.runSQL(sql)
    const dbLatency = Date.now() - startTime

    if (!execution.success || !execution.data) {
      throw new Error(execution.error || 'SQL execution failed')
    }

    const { data, columnFields } = execution.data

    // 4. Update with Result
    updateMessage(botMsgId, msg => ({
      ...msg,
      status: undefined,
      metadata: { aiLatency: 0, dbLatency, latency: dbLatency },
      reportData: {
        title: i18n.t('manual_query_title', { ns: 'chat' }),
        sql: sql,
        chartType: 'table', // Default to table for manual queries
        tableData: data,
        columnFields: columnFields,
        vizConfig: {},
      },
    }))
  } catch (error: any) {
    updateMessage(botMsgId, msg => ({
      ...msg,
      status: 'error',
      error: error?.message || 'Unknown error',
    }))
  }
}

const removeMessage = (id: string) => {
  const { messages } = getSessionState()
  const index = messages.findIndex(m => m.id === id)
  if (index === -1) return

  const message = messages[index]
  const idsToRemove = [id]

  if (message.type === 'assistant') {
    if (index > 0 && messages[index - 1].type === 'user') {
      idsToRemove.push(messages[index - 1].id)
    }
  }

  idsToRemove.forEach(mid => {
    useProjectStore.getState().deleteMessage(mid)
  })
}

const reset = () => {
  const activeSessionId = useProjectStore.getState().activeSessionId
  if (activeSessionId) {
    useProjectStore.getState().clearSessionMessages(activeSessionId)
  }
}

// --- The Hook ---

export const useChatStore = <T = ChatStore>(
  selector?: (state: ChatStore) => T
): T => {
  const projectState = useProjectStore()
  const activeSession = projectState.sessions.find(
    s => s.id === projectState.activeSessionId
  )

  const resolvedMessages = (activeSession?.messages || []).map(m => {
    if (m.widgetId && projectState.widgetRegistry[m.widgetId]) {
      return { ...m, reportData: projectState.widgetRegistry[m.widgetId] }
    }
    return m
  }) as ChatMessage[]

  const state: ChatStore = {
    messages: resolvedMessages,
    history: resolvedMessages, // alias
    replyToId: activeSession?.replyToId || null,
    abortController:
      projectState.abortControllers[projectState.activeSessionId] || null,

    setReplyTo: id => useProjectStore.getState().setReplyTo(id),
    updateMessage,
    updateReportConfig,
    updateMessageData,
    updateMessageInsight,
    sendMessage,
    retryMessage,
    rerunAnalysis,
    autoFixMessage,
    runTemplateSQL,
    addManualSqlMessage,
    resetLoading,
    stopGeneration,
    removeMessage,
    reset,
  }

  return selector ? selector(state) : (state as unknown as T)
}

// Mock getState
useChatStore.getState = (): ChatStore => {
  const { messages, replyToId, abortController } = getSessionState()
  return {
    messages: messages as ChatMessage[],
    history: messages as ChatMessage[],
    replyToId: replyToId || null,
    abortController: abortController || null,
    setReplyTo: id => useProjectStore.getState().setReplyTo(id),
    updateMessage,
    updateReportConfig,
    updateMessageData,
    updateMessageInsight,
    sendMessage,
    retryMessage,
    rerunAnalysis,
    autoFixMessage,
    runTemplateSQL,
    addManualSqlMessage,
    resetLoading,
    stopGeneration,
    removeMessage,
    reset,
  }
}

// Mock persist
useChatStore.persist = {
  hasHydrated: () => true,
  rehydrate: () => Promise.resolve(),
  onFinishHydration: () => {},
}
