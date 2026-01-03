import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'

interface UseChartOptionProps {
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
  data?: Array<Record<string, any>>
  config?: {
    x_axis?: string | null
    y_axis?: string | string[] | null
    series_name?: string | string[]
  }
}

export function useChartOption({
  type = 'bar',
  data = [],
  config,
}: UseChartOptionProps): EChartsOption {
  const x_axis = config?.x_axis
  const y_axis = config?.y_axis
  const { series_name } = config || {}
  const yAxes = Array.isArray(y_axis)
    ? y_axis.filter(Boolean)
    : y_axis
      ? [y_axis]
      : []

  const hasData = Array.isArray(data) && data.length > 0
  const hasAxes = !!x_axis && yAxes.length > 0
  const isRenderable = hasData && hasAxes && type !== 'table' && type !== 'kpi'

  const option = useMemo(() => {
    if (!isRenderable || !x_axis || yAxes.length === 0) {
      return {}
    }

    const xData = data.map(item => item[x_axis])

    const getSeriesName = (index: number) => {
      if (Array.isArray(series_name)) {
        return series_name[index] || yAxes[index]
      }
      return series_name || yAxes[index]
    }

    const baseSeries =
      type === 'scatter'
        ? yAxes.map((key, index) => ({
            name: getSeriesName(index),
            type: 'scatter',
            data: data.map(item => [item[x_axis], item[key]]),
            emphasis: { focus: 'series' },
          }))
        : yAxes.map((key, index) => ({
            name: getSeriesName(index),
            type: type === 'area' ? 'line' : type,
            data: data.map(item => item[key]),
            areaStyle: type === 'area' ? {} : undefined,
            itemStyle: {
              color: '#4F46E5', // Indigo-600
            },
          }))

    const baseOption: EChartsOption = {
      tooltip: {
        trigger: type === 'pie' ? 'item' : 'axis',
      },
      grid: {
        top: '4%',
        left: '4%',
        right: '4%',
        bottom: '4%',
        containLabel: true,
      },
      xAxis:
        type === 'scatter'
          ? { type: 'value' }
          : {
              type: 'category',
              data: xData,
              axisLabel: {
                interval: 'auto',
                hideOverlap: true,
                rotate: 0,
                width: 60,
                overflow: 'truncate',
              },
            },
      yAxis: {
        type: 'value',
      },
      series: baseSeries as any,
    }

    if (type === 'pie') {
      const pieOption: EChartsOption = {
        tooltip: { trigger: 'item' },
        series: [
          {
            name: Array.isArray(series_name)
              ? series_name[0] || yAxes[0]
              : series_name || yAxes[0],
            type: 'pie',
            radius: '50%',
            data: data.map(item => ({
              value: item[yAxes[0]],
              name: item[x_axis],
            })),
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)',
              },
            },
          },
        ],
      }
      return pieOption
    }

    return baseOption
  }, [data, isRenderable, series_name, type, x_axis, yAxes])

  return option
}
