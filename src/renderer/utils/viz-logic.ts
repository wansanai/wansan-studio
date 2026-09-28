import type { ReportData } from '@shared/types/dashboard'
import type { ChartType } from '@shared/types/dashboard'

export type DisplayMode = 'chart' | 'table' | 'bignumber' | 'empty' | 'text'

export function getDisplayMode(
  chartType: ChartType | undefined,
  data: Array<Record<string, unknown>>,
  vizConfig?: ReportData['vizConfig']
): DisplayMode {
  const hasData = data && data.length > 0

  if (!hasData && chartType !== 'text' && chartType !== 'table') return 'empty'
  if (chartType === 'kpi') return 'bignumber'
  if (chartType === 'text') return 'text'

  const showAsTable =
    chartType === 'table' || !vizConfig?.x_axis || !vizConfig?.y_axis

  if (showAsTable) return 'table'

  return 'chart'
}
