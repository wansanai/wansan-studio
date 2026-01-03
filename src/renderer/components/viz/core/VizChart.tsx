import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import { Chart } from '../base/Chart'
import { DrillDownMenu } from '../../visualizations/drill-down-menu'
import { useChatStore } from '../../../stores/useChatStore'
import { useChartOption } from '../../../hooks/useChartOption'

interface VizChartProps {
  type?:
    | 'bar'
    | 'line'
    | 'pie'
    | 'area'
    | 'table'
    | 'scatter'
    | 'kpi'
    | 'text'
    | 'gen-ui'
  title?: string
  data?: Array<Record<string, any>>
  config?: {
    x_axis?: string | null
    y_axis?: string | string[] | null
    series_name?: string | string[]
  }
  className?: string
  style?: React.CSSProperties
  messageId?: string
}

export function VizChart({
  type = 'bar',
  title: _title = '数据图表',
  data = [],
  config,
  className = '',
  style,
  messageId,
}: VizChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { t } = useTranslation('common')

  const [menuState, setMenuState] = useState<{
    visible: boolean
    x: number
    y: number
    name: string
    seriesName?: string
  } | null>(null)

  const handleChartClick = (params: any) => {
    if (params && params.event && params.event.event) {
      const { clientX, clientY } = params.event.event
      setMenuState({
        visible: true,
        x: clientX,
        y: clientY,
        name: params.name,
        seriesName: params.seriesName,
      })
    }
  }

  const handleFocus = () => {
    if (!menuState) return
    const displayMsg = `🔍 ${t('focus_analysis', { name: menuState.name })}`
    const hiddenMsg = `Filter the current analysis by ${menuState.name}. 
  CRITICAL CONSTRAINTS:
  - Maintain the current visualization metrics (aggregation).
  - DO NOT show raw data rows.
  - Keep the same chart type if possible.`

    if (messageId) {
      useChatStore.getState().setReplyTo(messageId)
    }
    useChatStore.getState().sendMessage(displayMsg, hiddenMsg)
    setMenuState(null)
  }

  const handleViewData = () => {
    if (!menuState) return
    const displayMsg = `📄 ${t('view_raw_data', { name: menuState.name })}`
    const hiddenMsg = `Show the first 100 raw data rows for '${menuState.name}'.
    Constraint: Switch viz_type to 'table'.`

    if (messageId) {
      useChatStore.getState().setReplyTo(messageId)
    }
    useChatStore.getState().sendMessage(displayMsg, hiddenMsg)
    setMenuState(null)
  }

  useEffect(() => {
    const handler = () => requestAnimationFrame(() => {})
    window.addEventListener('dashboard:layout-changed', handler)
    return () => {
      window.removeEventListener('dashboard:layout-changed', handler)
    }
  }, [])

  const option = useChartOption({ type, data, config })
  const isRenderable =
    Array.isArray(data) &&
    data.length > 0 &&
    config?.x_axis &&
    (Array.isArray(config.y_axis)
      ? config.y_axis.length > 0
      : !!config.y_axis) &&
    type !== 'table' &&
    type !== 'kpi'

  return (
    <div
      className={cn('relative', className)}
      ref={containerRef}
      style={{ height: '100%', width: '100%', ...style }}
    >
      <Chart
        option={option as any}
        className="relative h-full w-full"
        style={{ height: '100%', width: '100%', ...style }}
        onChartClick={handleChartClick}
      />
      {!isRenderable && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
          {t('no_chart_data')}
        </div>
      )}
      {menuState && (
        <DrillDownMenu
          x={menuState.x}
          y={menuState.y}
          dataName={menuState.name}
          onFocus={handleFocus}
          onViewData={handleViewData}
          onClose={() => setMenuState(null)}
        />
      )}
    </div>
  )
}
