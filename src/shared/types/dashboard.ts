import type { Layout } from 'react-grid-layout'
import { GenUIPayload } from '../schemas/gen-ui'

export interface ReportData {
  title: string
  subtitle?: string
  summary?: string
  insights?: string[]
  content?: string // For Text Widget
  sql?: string
  reasoning?: string
  suggestions?: string[]
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
  columns?: string[] // Legacy support
  columnTypes?: Record<string, string> // Legacy support
  vizConfig?: {
    x_axis?: string | null
    y_axis?: string | string[] | null
    series_name?: string | string[]
  }
  genSpec?: GenUIPayload
  timestamp?: number
  is_template?: boolean
  missing_params?: any[]
  selected_params?: Record<string, string[]>
}

export interface ReportWidget {
  id: string
  sourceMessageId: string
  widgetId: string
  layout: Layout
  pageIndex: number // 0-based index for A4 pagination
}
