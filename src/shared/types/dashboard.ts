import type { Layout } from 'react-grid-layout'
import type { FilterParam, InsightResult } from '../schemas/analysis'
import type { DomainRule } from '../types'

export type { InsightResult }

export type ChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'rose'
  | 'area'
  | 'table'
  | 'scatter'
  | 'radar'
  | 'combo'
  | 'kpi'
  | 'text'

export interface InsightGenerationContext {
  chartTitle: string
  chartType: string
  aggregatedData: Array<Record<string, unknown>>
  vizConfig?: Record<string, unknown>
  sql?: string
  summary?: string
  language?: 'en' | 'zh'
  domainRules?: DomainRule[]
  userInstructions?: string
}

export interface ReportData {
  title: string
  summary?: string
  content?: string // For Text Widget
  sql?: string
  template_sql?: string // [NEW] Preserve original template with placeholders
  reasoning?: string
  suggestions?: string[]
  chartType?: ChartType
  tableData?: Array<Record<string, unknown>>
  columnFields?: Array<{ name: string; type: string }>
  columns?: string[] // Legacy support
  columnTypes?: Record<string, string> // Legacy support
  vizConfig?: {
    x_axis?: string | null
    y_axis?: string | string[] | null
    series_name?: string | string[]
    split_by?: string | null
    show_labels?: boolean
  }
  timestamp?: number
  is_template?: boolean
  missing_params?: FilterParam[]
  selected_params?: Record<string, string[]>
  /** AI Business Insight (Structured) */
  insight?: InsightResult
  /** Timestamp when insight was generated */
  insightTime?: number
}

export interface ReportWidget {
  id: string
  sourceMessageId: string
  widgetId: string
  layout: Layout
  pageIndex: number // 0-based index for A4 pagination
  /** [NEW] Layout preferences for Report mode */
  reportConfig?: {
    layoutType: 'split' | 'flow'
    showInsight: boolean
    isSectionHeader?: boolean
  }
}
