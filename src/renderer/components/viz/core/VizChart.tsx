import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import { Chart } from '../base/Chart'
import { DrillDownMenu } from '../../visualizations/drill-down-menu'
import { useChartOption } from '../../../hooks/useChartOption'
import type { ChartType, ReportData } from '@shared/types/dashboard'

export type DrillDownActionType = 'focus' | 'view_data' | 'breakdown'

interface VizChartProps {
  type?: ChartType
  title?: string
  data?: Array<Record<string, unknown>>
  config?: ReportData['vizConfig']
  className?: string
  style?: React.CSSProperties
  _messageId?: string
  /** Column schema for breakdown dimension suggestions */
  columnFields?: Array<{ name: string; type: string }>
  /** Callback to trigger AI insight generation */
  onRequestInsight?: (chartData: Array<Record<string, unknown>>) => void
  /** Items to highlight (for visual anchoring) */
  highlightedItems?: string[]
  /** Callback for drill-down actions */
  onDrillDownAction?: (
    action: DrillDownActionType,
    payload: { name: string; dimension?: string }
  ) => void
}

export function VizChart({
  type = 'bar',
  title: _title = '数据图表',
  data = [],
  config,
  className = '',
  style,
  _messageId,
  columnFields = [],
  onRequestInsight,
  highlightedItems,
  onDrillDownAction,
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

  // Extract dimension columns (non-numeric) for breakdown suggestions
  const dimensionColumns = useMemo(() => {
    if (!columnFields.length) return []
    return columnFields
      .filter(
        col =>
          col.type === 'VARCHAR' ||
          col.type === 'TEXT' ||
          col.type.includes('CHAR')
      )
      .map(col => col.name)
      .filter(name => name !== config?.x_axis) // Exclude current x-axis
      .slice(0, 8) // Limit to prevent menu overflow
  }, [columnFields, config?.x_axis])

  type ChartClickEvent = {
    event?: { event?: { clientX: number; clientY: number } }
    componentType?: string
    value?: unknown
    name?: string
    seriesName?: string
  }

  const handleChartClick = useCallback((params: unknown) => {
    const event = params as ChartClickEvent
    if (event.event?.event) {
      const { clientX, clientY } = event.event.event
      const rawName = event.componentType === 'xAxis' ? event.value : event.name

      if (rawName === undefined || rawName === null || rawName === '') return
      const name = String(rawName)

      setMenuState({
        visible: true,
        x: clientX,
        y: clientY,
        name,
        seriesName: event.seriesName,
      })
    }
  }, [])

  const handleFocus = useCallback(() => {
    if (!menuState || !onDrillDownAction) return
    onDrillDownAction('focus', { name: menuState.name })
    setMenuState(null)
  }, [menuState, onDrillDownAction])

  const handleViewData = useCallback(() => {
    if (!menuState || !onDrillDownAction) return
    onDrillDownAction('view_data', { name: menuState.name })
    setMenuState(null)
  }, [menuState, onDrillDownAction])

  const handleBreakdown = useCallback(
    (dimension: string) => {
      if (!menuState || !onDrillDownAction) return
      onDrillDownAction('breakdown', { name: menuState.name, dimension })
      setMenuState(null)
    },
    [menuState, onDrillDownAction]
  )

  const handleInsight = useCallback(() => {
    if (!onRequestInsight || !data.length) return
    onRequestInsight(data)
    setMenuState(null)
  }, [data, onRequestInsight])

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
        option={option}
        className="relative h-full w-full"
        style={{ height: '100%', width: '100%', ...style }}
        onChartClick={handleChartClick}
        highlightedItems={highlightedItems}
        showLabels={config?.show_labels}
      />
      {!isRenderable && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
          {t('no_chart_data')}
        </div>
      )}
      {menuState && onDrillDownAction && ( // Only show menu if handler is provided
        <DrillDownMenu
          x={menuState.x}
          y={menuState.y}
          dataName={menuState.name}
          dimensions={dimensionColumns}
          onFocus={handleFocus}
          onViewData={handleViewData}
          onBreakdown={handleBreakdown}
          onInsight={onRequestInsight ? handleInsight : undefined}
          onClose={() => setMenuState(null)}
        />
      )}
    </div>
  )
}
