import type { EChartsOption } from 'echarts'
import * as echarts from 'echarts'

type VizConfig = {
  x_axis?: string | null
  y_axis?: string | string[] | null
  series_name?: string | string[]
}

type VizType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'scatter'
  | 'table'
  | 'area'
  | 'kpi'
  | 'text'
  | 'gen-ui'

/**
 * Categorizes chart types into groups for conversion logic
 */
function getChartCategory(
  type: VizType
): 'cartesian' | 'radial' | 'tabular' | 'kpi' | 'text' | 'gen-ui' {
  const cartesianTypes = ['bar', 'line', 'area', 'scatter']
  const radialTypes = ['pie']
  const tabularTypes = ['table']
  const kpiTypes = ['kpi']

  if (cartesianTypes.includes(type)) return 'cartesian'
  if (radialTypes.includes(type)) return 'radial'
  if (tabularTypes.includes(type)) return 'tabular'
  if (kpiTypes.includes(type)) return 'kpi'
  if (type === 'text') return 'text'
  if (type === 'gen-ui') return 'gen-ui'

  return 'cartesian' // default
}

/**
 * Adapts visualization configuration when switching chart types
 * Handles data structure mapping between different chart type categories
 *
 * @param newType - Target chart type
 * @param oldType - Current chart type
 * @param oldConfig - Current visualization configuration
 * @param data - Raw data rows
 * @returns Adapted configuration for the new chart type
 */
export function adaptChartConfig(
  newType: VizType,
  oldType: VizType | undefined,
  oldConfig: VizConfig | undefined,
  data: Array<Record<string, any>>
): { type: Exclude<VizType, 'area'>; config?: VizConfig } {
  // Convert 'area' to 'line' for compatibility
  const targetType: Exclude<VizType, 'area'> =
    newType === 'area' ? 'line' : newType

  const oldCategory = oldType ? getChartCategory(oldType) : 'cartesian'
  const newCategory = getChartCategory(targetType)

  // Case 1: Same category conversion (trivial)
  if (oldCategory === newCategory && oldCategory !== 'radial') {
    // For cartesian charts, just change the type
    return {
      type: targetType,
      config: oldConfig,
    }
  }

  // Case 2: Cartesian to Radial (e.g., bar -> pie)
  if (oldCategory === 'cartesian' && newCategory === 'radial') {
    const xAxis = oldConfig?.x_axis
    const yAxis = Array.isArray(oldConfig?.y_axis)
      ? oldConfig?.y_axis?.[0]
      : oldConfig?.y_axis

    // If we have valid axes, preserve them
    if (xAxis && yAxis) {
      return {
        type: targetType,
        config: {
          x_axis: xAxis,
          y_axis: [yAxis],
          series_name: oldConfig?.series_name,
        },
      }
    }

    // Otherwise, try to intelligently select columns
    if (data.length > 0) {
      const columns = Object.keys(data[0])
      const numericColumns = columns.filter(col => {
        const value = data[0][col]
        return typeof value === 'number'
      })
      const textColumns = columns.filter(col => {
        const value = data[0][col]
        return typeof value === 'string'
      })

      // Select first text column as x-axis (categories)
      // Select first numeric column as y-axis (values)
      if (textColumns.length > 0 && numericColumns.length > 0) {
        return {
          type: targetType,
          config: {
            x_axis: textColumns[0],
            y_axis: [numericColumns[0]],
          },
        }
      }
    }
  }

  // Case 3: Radial to Cartesian (e.g., pie -> bar)
  if (oldCategory === 'radial' && newCategory === 'cartesian') {
    // For pie to cartesian, try to preserve the same columns if possible
    if (oldConfig?.x_axis && oldConfig?.y_axis) {
      return {
        type: targetType,
        config: oldConfig,
      }
    }

    // Otherwise, intelligently select columns
    if (data.length > 0) {
      const columns = Object.keys(data[0])
      const numericColumns = columns.filter(col => {
        const value = data[0][col]
        return typeof value === 'number'
      })
      const textColumns = columns.filter(col => {
        const value = data[0][col]
        return typeof value === 'string'
      })

      if (textColumns.length > 0 && numericColumns.length > 0) {
        return {
          type: targetType,
          config: {
            x_axis: textColumns[0],
            y_axis: [numericColumns[0]],
          },
        }
      }
    }
  }

  // Case 4: Any to Table
  if (newCategory === 'tabular') {
    return {
      type: 'table',
      config: {}, // Table doesn't need axis configuration
    }
  }

  // Case 5: Any to KPI
  if (newCategory === 'kpi') {
    // For KPI, select the first numeric column if available
    let selectedColumn: string | undefined

    if (data.length > 0) {
      const columns = Object.keys(data[0])
      const numericColumns = columns.filter(col => {
        const value = data[0][col]
        return typeof value === 'number'
      })

      if (numericColumns.length > 0) {
        selectedColumn = numericColumns[0]
      }
    }

    return {
      type: 'kpi',
      config: selectedColumn
        ? {
            y_axis: [selectedColumn],
          }
        : {},
    }
  }

  // Case 6: Any to Text
  if (newCategory === 'text') {
    return {
      type: 'text',
      config: {},
    }
  }

  // Default fallback: return a basic configuration
  // This handles cases like undefined oldType or uncategorized conversions
  if (data.length > 0) {
    const columns = Object.keys(data[0])
    const numericColumns = columns.filter(col => {
      const value = data[0][col]
      return typeof value === 'number'
    })
    const textColumns = columns.filter(col => {
      const value = data[0][col]
      return typeof value === 'string'
    })

    if (textColumns.length > 0 && numericColumns.length > 0) {
      return {
        type: targetType,
        config: {
          x_axis: textColumns[0],
          y_axis: [numericColumns[0]],
        },
      }
    }

    if (numericColumns.length > 0) {
      return {
        type: targetType,
        config: {
          y_axis: [numericColumns[0]],
        },
      }
    }
  }

  return {
    type: targetType,
    config: {},
  }
}

/**
 * Generates a complete EChartsOption based on chart type and configuration
 * Used by components like A4Chart to render the actual chart
 */
export function buildEChartsOption(
  type: VizType,
  config: VizConfig | undefined,
  data: Array<Record<string, any>>
): EChartsOption {
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
  const isRenderable =
    hasData && hasAxes && type !== 'table' && type !== 'kpi' && type !== 'text'

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

  const baseSeries: echarts.SeriesOption[] =
    type === 'scatter'
      ? yAxes.map((key, index) => ({
          name: getSeriesName(index),
          type: 'scatter',
          data: data.map(item => [item[x_axis], item[key]]),
          emphasis: { focus: 'series' },
        }))
      : yAxes.map((key, index) => ({
          name: getSeriesName(index),
          type: (type === 'area' ? 'line' : type) as any,
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
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis:
      type === 'scatter'
        ? { type: 'value' as const }
        : {
            type: 'category' as const,
            data: xData,
            axisLabel: { interval: 0, rotate: 30 },
          },
    yAxis: {
      type: 'value' as const,
    },
    series: baseSeries,
  }

  if (type === 'pie') {
    return {
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
  }

  return baseOption
}

/**
 * Extracts chart type from ECharts option
 */
export function extractChartType(option: EChartsOption): VizType | undefined {
  if (
    !option ||
    !option.series ||
    !Array.isArray(option.series) ||
    option.series.length === 0
  ) {
    return undefined
  }

  const seriesType = option.series[0].type
  return seriesType as VizType
}

/**
 * Limits the number of categories for pie charts (improves readability)
 */
export function limitPieCategories(
  data: Array<Record<string, any>>,
  xAxis: string,
  yAxis: string,
  maxCategories: number = 20
): Array<Record<string, any>> {
  if (data.length <= maxCategories) return data

  // Sort by value (descending)
  const sorted = [...data].sort((a, b) => (b[yAxis] || 0) - (a[yAxis] || 0))

  // Take top N-1 categories
  const topCategories = sorted.slice(0, maxCategories - 1)

  // Sum remaining as "Others"
  const others = sorted.slice(maxCategories - 1)
  if (others.length > 0) {
    const othersSum = others.reduce((sum, item) => sum + (item[yAxis] || 0), 0)
    topCategories.push({
      [xAxis]: 'Others',
      [yAxis]: othersSum,
    } as any)
  }

  return topCategories
}
