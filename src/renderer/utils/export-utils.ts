import type { ExportSheetData } from '@shared/api-types'
import type { Message } from '@shared/types/chat'
import type { InsightResult, ReportData } from '@shared/types/dashboard'
import type { DenormalizedReportWidget } from '../stores/useWorkbenchStore'

/**
 * Converts an array of objects to a CSV string.
 * @param data Array of data objects
 * @param columns Optional list of column names to include/order
 * @returns CSV string
 */
export function dataToCSV(
  data: Array<Record<string, unknown>>,
  columns?: string[]
): string {
  if (!data || data.length === 0) return ''

  const header = columns || Object.keys(data[0])
  const csvRows = [
    header.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(','),
  ]

  for (const row of data) {
    const values = header.map((col) => {
      const value = row[col]
      if (value === null || value === undefined) return ''
      const stringValue = String(value)
      return `"${stringValue.replace(/"/g, '""')}"`
    })
    csvRows.push(values.join(','))
  }

  return csvRows.join('\n')
}

/**
 * Capture a chart as base64 and its dimensions from a container ID.
 */
export async function captureChartInfo(
  exportId: string
): Promise<{ dataUrl: string; width: number; height: number } | undefined> {
  const container = document.querySelector(`[data-export-id="${exportId}"]`)
  if (!container) return undefined

  const canvas = container.querySelector('canvas')
  if (!(canvas instanceof HTMLCanvasElement)) return undefined

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  }
}

type InsightLabels = {
  summary: string
  findings: string
  recommendation: string
}

function getInsightFindingText(finding: InsightResult['findings'][number]): string {
  if (finding.markdown) return finding.markdown

  const legacyFinding = finding as InsightResult['findings'][number] & {
    content?: string
  }
  return legacyFinding.content || ''
}

/**
 * Formats structured AI insight into a plain string for Excel.
 */
export function formatInsight(
  insight: InsightResult | string | undefined,
  labels: InsightLabels
): string | undefined {
  if (!insight) return undefined
  if (typeof insight === 'string') return insight

  const parts: string[] = []
  if (insight.summary) parts.push(`${labels.summary}: ${insight.summary}\n`)

  if (Array.isArray(insight.findings)) {
    parts.push(`${labels.findings}:`)
    insight.findings.forEach((finding) => {
      parts.push(`• ${getInsightFindingText(finding)}`)
    })
    parts.push('')
  }

  if (insight.recommendation) {
    parts.push(`${labels.recommendation}: ${insight.recommendation}`)
  }

  return parts.join('\n').trim()
}

function toExportSheet(
  id: string,
  report: ReportData,
  chartInfo: Awaited<ReturnType<typeof captureChartInfo>>
): ExportSheetData {
  return {
    name: report.title || id,
    data: report.tableData || [],
    columns: report.columnFields || [],
    insight: formatInsight(report.insight, {
      summary: 'Summary',
      findings: 'Findings',
      recommendation: 'Recommendation',
    }),
    chartImage: chartInfo?.dataUrl,
    chartWidth: chartInfo?.width,
    chartHeight: chartInfo?.height,
  }
}

/**
 * Collects data for Excel export from Chat Messages.
 */
export async function collectExcelDataFromChat(
  messages: Message[],
  labels: InsightLabels
): Promise<ExportSheetData[]> {
  const sheets: ExportSheetData[] = []

  for (const msg of messages) {
    if (msg.type === 'assistant' && msg.reportData?.tableData) {
      const chartInfo = await captureChartInfo(msg.id)
      sheets.push({
        ...toExportSheet(
          `Chat_${msg.id.slice(0, 4)}`,
          msg.reportData,
          chartInfo
        ),
        name: msg.reportData.title || `Chat_${msg.id.slice(0, 4)}`,
        insight: formatInsight(msg.reportData.insight, labels),
      })
    }
  }

  return sheets
}

/**
 * Collects data for Excel export from Dashboard Widgets.
 */
export async function collectExcelDataFromDashboard(
  widgets: DenormalizedReportWidget[],
  labels: InsightLabels
): Promise<ExportSheetData[]> {
  const sheets: ExportSheetData[] = []

  for (const widget of widgets) {
    const report = widget.reportData
    if (report?.tableData && report.chartType !== 'text') {
      const chartInfo = await captureChartInfo(widget.id)
      sheets.push({
        ...toExportSheet(
          `Widget_${widget.id.slice(0, 4)}`,
          report,
          chartInfo
        ),
        name: report.title || `Widget_${widget.id.slice(0, 4)}`,
        insight: formatInsight(report.insight, labels),
      })
    }
  }

  return sheets
}
