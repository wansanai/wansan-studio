import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption, EChartsType } from 'echarts'
import { applyWansanTheme } from '../../../lib/echarts-theme'
import { useSettingsStore } from '@/stores/useSettingsStore'

type AxisDataItem = { value?: unknown }
type SeriesDataItem = { name?: unknown }
type AxisOptionLike = { type?: string; data?: unknown[] }
type SeriesOptionLike = { data?: unknown[] }

interface ReportChartProps {
  option: EChartsOption
  className?: string
  style?: React.CSSProperties
  onChartClick?: (params: unknown) => void
  highlightedItems?: string[]
  showLabels?: boolean
}

export function Chart({
  option,
  className,
  style,
  onChartClick,
  highlightedItems = [],
  showLabels: localShowLabels,
}: ReportChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<EChartsType | null>(null)
  const globalShowLabels = useSettingsStore(state => state.showChartLabels)

  const showChartLabels = localShowLabels !== undefined ? localShowLabels : globalShowLabels

  useEffect(() => {
    const el = chartRef.current
    if (!el) return

    const instance = echarts.init(el)
    instanceRef.current = instance

    const resize = () => instance.resize()
    const observer = new ResizeObserver(() => resize())
    observer.observe(el)
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      observer.disconnect()
      instance.dispose()
      instanceRef.current = null
    }
  }, [])

  // Bind/Unbind click listener separately
  useEffect(() => {
    const instance = instanceRef.current
    if (!instance || !onChartClick) return

    const handler = (params: unknown) => {
      onChartClick(params)
    }

    instance.on('click', handler)
    return () => {
      instance.off('click', handler)
    }
  }, [onChartClick])

  useEffect(() => {
    if (!instanceRef.current) return
    const themedOption = applyWansanTheme(option, showChartLabels)
    instanceRef.current.setOption(themedOption, { notMerge: true })
  }, [option, showChartLabels])

  // Handle Highlights
  useEffect(() => {
    const instance = instanceRef.current
    if (!instance) return

    // Get current series to determine indices to target
    const currentOption = instance.getOption() as EChartsOption
    const series = Array.isArray(currentOption.series)
      ? currentOption.series
      : currentOption.series
        ? [currentOption.series]
        : []

    if (series.length === 0) return

    // Create an array of all series indices [0, 1, 2, ...]
    const seriesIndices = Array.from({ length: series.length }, (_, i) => i)

    // Always reset downplay first to ensure clean state across all series
    instance.dispatchAction({
      type: 'downplay',
      seriesIndex: seriesIndices,
    })

    if (highlightedItems.length === 0) {
      instance.dispatchAction({
        type: 'hideTip',
      })
      return
    }

    // --- Fuzzy Match Logic ---
    // AI might return partial keys (e.g. "Aug" instead of "2025-08-01")
    // We search for the indices of matching items to perform a more reliable highlight.
    const targetIndices: number[] = []

    const isMatch = (val: unknown) => {
      if (val === null || val === undefined) return false
      const strVal = String(val).toLowerCase()
      return highlightedItems.some(highlight => {
        const hLower = String(highlight).toLowerCase()
        return (
          strVal === hLower ||
          strVal.includes(hLower) ||
          hLower.includes(strVal)
        )
      })
    }

    // A. Check xAxis (Category)
    const xAxis = Array.isArray(currentOption.xAxis)
      ? currentOption.xAxis[0]
      : currentOption.xAxis
    
    const xAxisData = (xAxis as AxisOptionLike | undefined)?.data
    
    if (xAxis && (xAxis.type === 'category' || !xAxis.type) && Array.isArray(xAxisData)) {
      xAxisData.forEach((datum, idx: number) => {
        const val =
          typeof datum === 'object' && datum !== null && 'value' in datum
            ? (datum as AxisDataItem).value
            : datum
        if (isMatch(val)) {
          targetIndices.push(idx)
        }
      })
    }
    // B. Check Series Data (e.g. Pie chart names)
    else {
      (series as SeriesOptionLike[]).forEach((seriesItem) => {
        if (Array.isArray(seriesItem.data)) {
          seriesItem.data.forEach((datum, idx: number) => {
            const name =
              typeof datum === 'object' && datum !== null && 'name' in datum
                ? (datum as SeriesDataItem).name
                : null
            if (name && isMatch(name)) {
              targetIndices.push(idx)
            }
          })
        }
      })
    }

    const uniqueIndices = Array.from(new Set(targetIndices))

    if (uniqueIndices.length > 0) {
      // Highlight specific items by index across all series
      instance.dispatchAction({
        type: 'highlight',
        seriesIndex: seriesIndices,
        dataIndex: uniqueIndices,
      })
    }

    // Note: We intentionally DO NOT trigger 'showTip' here.
    // The Insight Panel already provides the textual context.
  }, [highlightedItems])

  return <div ref={chartRef} className={className} style={style} />
}
