import React, { useState } from 'react'
import { VizHeader } from './VizHeader'
import { VizSummary } from './VizSummary'
import { VizChart } from './VizChart'
import { KpiCard } from '../base/KpiCard'
import { cn } from '@/utils/cn'
import { Lightbulb } from 'lucide-react'
import { DataTable } from '../base/DataTable'
import { useTranslation } from 'react-i18next'
import { getDisplayMode } from '@/utils/viz-logic'
import ShadowWidget from '../../widgets/gen-ui/ShadowWidget'
import { GenUIPayload } from '@shared/schemas/gen-ui'

interface VizRendererProps {
  title: string
  subtitle?: string
  summary?: string
  insights?: string[]
  chartType?:
    | 'bar'
    | 'line'
    | 'pie'
    | 'area'
    | 'table'
    | 'scatter'
    | 'kpi'
    | 'text'
    | 'gen-ui'
  chartTitle?: string
  tableData?: Array<Record<string, any>>
  columnFields?: Array<{ name: string; type: string }>
  columns?: string[]
  columnTypes?: Record<string, string>
  vizConfig?: {
    x_axis?: string | null
    y_axis?: string | string[] | null
    series_name?: string | string[]
  }
  genSpec?: GenUIPayload
  timestamp?: number
  className?: string
  variant?: 'chat' | 'dashboard'
  onTitleChange?: (newTitle: string) => void
  messageId?: string
}

const VizRendererBase = ({
  title,
  subtitle,
  summary,
  insights,
  chartType = 'bar',
  chartTitle,
  tableData,
  columnFields = [],
  columns = [],
  columnTypes = {},
  vizConfig,
  genSpec,
  className,
  variant = 'chat',
  onTitleChange,
  timestamp,
  messageId,
}: VizRendererProps) => {
  const [showSummary, setShowSummary] = useState(false)
  const { t } = useTranslation('common')

  const displayMode = getDisplayMode(chartType, tableData || [], vizConfig)

  if (variant === 'dashboard') {
    return (
      <div className={cn('flex flex-col h-full p-4 bg-white', className)}>
        <VizHeader
          title={title}
          subtitle={subtitle}
          className="mb-1 pb-2 flex-shrink-0"
          onTitleChange={onTitleChange}
          isEditable={true}
          showTimestamp={false}
          size="sm"
          actions={
            summary ? (
              <div className="relative">
                <button
                  className={cn(
                    'p-2 rounded-full transition-colors hide-on-export',
                    showSummary
                      ? 'bg-yellow-50 text-yellow-600'
                      : 'text-zinc-400 hover:text-yellow-600 hover:bg-zinc-50'
                  )}
                  onMouseEnter={() => setShowSummary(true)}
                  onMouseLeave={() => setShowSummary(false)}
                  title={t('summary')}
                >
                  <Lightbulb className="w-5 h-5" />
                </button>

                {showSummary && (
                  <div className="absolute right-0 top-full mt-2 w-72 p-4 bg-white rounded-lg shadow-xl border border-zinc-200 z-50 text-sm text-zinc-600 animate-in fade-in slide-in-from-top-1">
                    <div className="font-medium text-zinc-900 mb-2 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-500" />
                      {t('summary')}
                    </div>
                    <div className="max-h-60 overflow-y-auto">{summary}</div>
                    {timestamp && (
                      <div className="mt-3 pt-2 border-t border-zinc-100 text-xs text-zinc-400">
                        <div className="font-medium text-zinc-500 mb-0.5">
                          {t('generated_time')}
                        </div>
                        <div className="font-mono">
                          {new Date(timestamp).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : undefined
          }
        />

        <div className="flex-1 min-h-0 w-full mb-0 p-2">
          {chartType === 'gen-ui' && genSpec && (
            <ShadowWidget
              payload={genSpec}
              data={tableData}
              width={0} // Auto
              height={0} // Auto
            />
          )}

          {displayMode === 'chart' && chartType !== 'gen-ui' && (
            <VizChart
              type={chartType}
              title={chartTitle}
              data={tableData}
              config={vizConfig}
              className="h-full w-full"
              messageId={messageId}
            />
          )}

          {displayMode === 'bignumber' && tableData && (
            <div className="h-full w-full flex items-center justify-center">
              <KpiCard
                value={(() => {
                  const yCol = Array.isArray(vizConfig?.y_axis)
                    ? vizConfig.y_axis[0]
                    : vizConfig?.y_axis
                  const targetCol = yCol || Object.keys(tableData[0])[0]
                  return tableData[0][targetCol]
                })()}
                label={(() => {
                  const yCol = Array.isArray(vizConfig?.y_axis)
                    ? vizConfig.y_axis[0]
                    : vizConfig?.y_axis
                  return yCol || Object.keys(tableData[0])[0]
                })()}
                variant={variant}
              />
            </div>
          )}

          {displayMode === 'table' && (
            <div className="h-full w-full overflow-auto space-y-4">
              <DataTable
                data={tableData}
                columnFields={columnFields}
                columns={columns}
                columnTypes={columnTypes}
                variant="dashboard"
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full p-5 bg-white', className)}>
      <VizHeader
        title={title}
        subtitle={subtitle}
        className="mb-5"
        timestamp={timestamp}
        showTimestamp={false}
      />

      <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-2">
        {summary && (
          <div className="text-sm text-zinc-600 leading-relaxed mb-4">
            <VizSummary content={summary} insights={insights} />
          </div>
        )}

        {chartType === 'gen-ui' && genSpec && (
          <div className="w-full pb-4 pt-2 min-h-[300px]">
            <ShadowWidget
              payload={genSpec}
              data={tableData}
              width={0}
              height={0}
            />
          </div>
        )}

        {displayMode === 'chart' && chartType !== 'gen-ui' && (
          <div className="h-[250px] w-full pb-4 pt-2">
            <VizChart
              type={chartType}
              title={chartTitle}
              data={tableData}
              config={vizConfig}
              className="h-full w-full"
              messageId={messageId}
            />
          </div>
        )}

        {displayMode === 'bignumber' && tableData && (
          <div className="h-full w-full flex items-center justify-center">
            <KpiCard
              value={(() => {
                const yCol = Array.isArray(vizConfig?.y_axis)
                  ? vizConfig.y_axis[0]
                  : vizConfig?.y_axis
                const targetCol = yCol || Object.keys(tableData[0])[0]
                return tableData[0][targetCol]
              })()}
              label={(() => {
                const yCol = Array.isArray(vizConfig?.y_axis)
                  ? vizConfig.y_axis[0]
                  : vizConfig?.y_axis
                return yCol || Object.keys(tableData[0])[0]
              })()}
              variant={variant}
            />
          </div>
        )}

        {displayMode === 'table' && (
          <div>
            <h4 className="text-sm font-semibold text-zinc-800 mb-2">
              {t('data_detail')}
            </h4>
            <DataTable
              data={tableData}
              columnFields={columnFields}
              columns={columns}
              columnTypes={columnTypes}
              variant="chat"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export const VizRenderer = React.memo(VizRendererBase, (prev, next) => {
  return (
    prev.chartType === next.chartType &&
    prev.chartTitle === next.chartTitle &&
    prev.title === next.title &&
    prev.variant === next.variant &&
    prev.timestamp === next.timestamp &&
    prev.tableData === next.tableData &&
    JSON.stringify(prev.vizConfig) === JSON.stringify(next.vizConfig)
  )
})
