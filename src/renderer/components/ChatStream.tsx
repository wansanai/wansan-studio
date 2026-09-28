import React, { useState, useMemo } from 'react'
import { ChatInterface } from './ChatInterface'
import { TableSchema } from '../../shared/types'
import { useChatStore } from '../stores/useChatStore'
import { useProjectStore } from '../stores/useProjectStore'
import { SmartFilterModal } from './modals/SmartFilterModal'
import { useToastStore } from '../stores/useToastStore'
import { FilterParam } from '@shared/schemas/analysis'
import { useTranslation } from 'react-i18next'
import { mapFileToSchema } from '../utils/schema-mapper'

export function ChatStream() {
  const { t } = useTranslation('chat')

  // Select only needed state to minimize re-renders
  const files = useProjectStore(s => s.files)
  const activeFileId = useProjectStore(s => s.activeFileId)
  const smartFilterRequest = useProjectStore(s => s.smartFilterRequest)

  const messages = useChatStore(state => state.messages)
  const sendMessage = useChatStore(state => state.sendMessage)
  const runTemplateSQL = useChatStore(state => state.runTemplateSQL)

  const { addToast } = useToastStore()
  const [activeTemplate, setActiveTemplate] = useState<{
    messageId: string
    templateSql: string
    params: FilterParam[]
    initialValues?: Record<string, string[]>
  } | null>(null)

  // Memoize ready files to avoid downstream calculation on every progress update
  const readyFiles = useMemo(
    () => files.filter(f => f.status === 'ready'),
    [files]
  )

  const currentFile = useMemo(
    () => readyFiles.find(f => f.id === activeFileId) || readyFiles[0],
    [readyFiles, activeFileId]
  )

  // Map store files to TableSchema for AI - Memoized
  const schemas: TableSchema[] = useMemo(
    () => readyFiles.map(f => mapFileToSchema(f, files)),
    [readyFiles, files]
  )

  const onQuerySubmit = (query: string) => {
    sendMessage(query, undefined, schemas)
  }

  // Get current columns for autocomplete - Memoized
  const currentColumns = useMemo(
    () => currentFile?.columns.map(c => c.name) || [],
    [currentFile]
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50 min-h-0">
      {/* 聊天主界面 */}
      <div className="flex-1 overflow-hidden relative min-h-0">
        <ChatInterface
          tableName={currentFile?.tableName}
          columns={currentColumns}
          messages={messages}
          onQuerySubmit={onQuerySubmit}
          onConfigureTemplate={(
            messageId,
            templateSql,
            params,
            initialValues
          ) => {
            setActiveTemplate({ messageId, templateSql, params, initialValues })
          }}
          loading={
            messages.some(m => m.status === 'thinking')
              ? 'thinking'
              : messages.some(
                    m => m.status === 'planning' || m.status === 'executing'
                  )
                ? 'crunching'
                : null
          }
          className="h-full"
        />

        {smartFilterRequest && (
          <SmartFilterModal
            isOpen={smartFilterRequest.isOpen}
            onCancel={() => {
              smartFilterRequest.reject(new Error('Cancelled'))
              addToast({
                type: 'info',
                title: t('analysis_cancelled_title'),
                description: t('analysis_cancelled_desc'),
                duration: 3000,
              })
            }}
            params={smartFilterRequest.params}
            templateSql={smartFilterRequest.templateSql}
            onConfirm={(sql, params) =>
              smartFilterRequest.resolve({ sql, params })
            }
          />
        )}

        {activeTemplate && (
          <SmartFilterModal
            isOpen={true}
            onCancel={() => setActiveTemplate(null)}
            params={activeTemplate.params}
            templateSql={activeTemplate.templateSql}
            initialValues={activeTemplate.initialValues}
            onConfirm={(sql, params) => {
              runTemplateSQL(activeTemplate.messageId, sql, params)
              setActiveTemplate(null)
            }}
          />
        )}
      </div>
    </div>
  )
}
