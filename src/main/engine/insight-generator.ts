import { OpenAI } from 'openai'
import { InsightGenerationContext, InsightResult } from '@shared/types/dashboard'
import { InsightResultSchema } from '@shared/schemas/analysis.ts'
import { autospaceInsight } from '@shared/utils/autospace'
import { callAIAndParse, getModelToUse } from './ai-utils'
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources'

/**
 * Smartly downsamples data to a target limit while preserving critical points.
 * - Always keeps start and end points.
 * - Keeps global max/min points for value columns.
 * - Uniformly samples the rest.
 */
function smartDownsample(
  data: Array<Record<string, unknown>>,
  limit: number,
  valueKeys: string[] = []
): Array<Record<string, unknown>> {
  if (data.length <= limit) return data

  const indices = new Set<number>()
  const len = data.length

  // 1. Always keep start and end
  indices.add(0)
  indices.add(len - 1)

  // 2. Keep extremes (Max/Min) for value columns
  if (valueKeys.length > 0) {
    valueKeys.forEach(key => {
      let minVal = Infinity
      let maxVal = -Infinity
      let minIdx = -1
      let maxIdx = -1

      for (let i = 0; i < len; i++) {
        const val = Number(data[i][key])
        if (!isNaN(val)) {
          if (val < minVal) {
            minVal = val
            minIdx = i
          }
          if (val > maxVal) {
            maxVal = val
            maxIdx = i
          }
        }
      }

      if (minIdx !== -1) indices.add(minIdx)
      if (maxIdx !== -1) indices.add(maxIdx)
    })
  }

  // 3. Fill remaining slots uniformly
  const currentCount = indices.size
  const needed = limit - currentCount
  if (needed > 0) {
    // Distribute remaining points across the array
    const step = len / (needed + 1)
    for (let i = 1; i <= needed; i++) {
      const idx = Math.floor(i * step)
      if (idx > 0 && idx < len - 1) {
        indices.add(idx)
      }
    }
  }

  // 4. Sort indices and map back to data
  return Array.from(indices)
    .sort((a, b) => a - b)
    .map(i => data[i])
}

/**
 * Generate a natural language insight/explanation from aggregated chart data.
 * This function receives ONLY aggregated data (not raw rows) after user consent.
 */
export async function generateInsight(
  openai: OpenAI,
  context: InsightGenerationContext,
  model?: string
): Promise<InsightResult> {
  const {
    chartTitle,
    chartType,
    aggregatedData,
    language = 'en',
    domainRules = [],
    userInstructions,
    sql,
    vizConfig,
    summary,
  } = context

  const languageNote = language === 'zh' ? 'Chinese (Simplified)' : 'English'

  // Identify value keys for smart downsampling
  // Strategy: Union of configured Y-axes AND all detected numeric columns to ensure we catch all series extremes
  const detectedNumericKeys =
    aggregatedData.length > 0
      ? Object.keys(aggregatedData[0]).filter(
          k => typeof aggregatedData[0][k] === 'number'
        )
      : []

  let configKeys: string[] = []
  if (vizConfig?.y_axis) {
    configKeys = Array.isArray(vizConfig.y_axis)
      ? vizConfig.y_axis
      : [vizConfig.y_axis]
  }

  const valueKeys = Array.from(new Set([...configKeys, ...detectedNumericKeys]))

  // Use smart downsampling to preserve peaks/valleys/start/end
  const sampledData = smartDownsample(aggregatedData, 100, valueKeys)
  const dataStr = JSON.stringify(sampledData, null, 2)

  // Build domain context section
  const domainContext =
    domainRules.length > 0
      ? `\n\n### BUSINESS CONTEXT / DOMAIN KNOWLEDGE:\n${domainRules
          .filter(r => r.isEnabled)
          .map((r, i) => `[Rule #${i + 1}]\n${r.content}`)
          .join('\n\n')}`
      : ''

  const systemPrompt = `You are a Senior Business Analyst specializing in data storytelling.
Your task is to analyze aggregated chart data and provide actionable business insights in structured JSON format.${domainContext}

CONSTRAINTS:
- Be concise and professional.
- **Balanced Analysis**: Actively look for BOTH **positive anomalies** (e.g., spikes, rapid growth, exceeding targets) AND **negative anomalies** (e.g., drops, underperformance, risks). Do not focus only on problems.
- Focus on trends, anomalies, and actionable recommendations.
- Write content in ${languageNote}.
- **CRITICAL**: For each finding, identify the EXACT X-axis category names from the data that support the finding (e.g., specific months, regions).
- **Sentiment**: Use one of the following specific types: 'positive', 'negative', 'neutral', 'warning' (for risks), 'growth' (for opportunities), 'discovery' (for insights), 'target' (for goals), 'info'.

OUTPUT FORMAT (JSON):
{
  "summary": "One sentence describing the overall trend.",
  "findings": [
    {
      "id": "1",
      "markdown": "**March** traffic surged by 30%...",
      "sentiment": "growth",
      "relatedItems": ["Mar"] // Must match data keys exactly
    },
    {
      "id": "2",
      "markdown": "**February** sales dropped by 15%...",
      "sentiment": "negative",
      "relatedItems": ["Feb"] // Must match data keys exactly
    }
  ],
  "recommendation": "One actionable suggestion (optional)"
}`

  let userPrompt = `### Chart Title
${chartTitle}

### Visualization Type
${chartType}`

  if (summary) {
    userPrompt += `

### Analysis Summary (Context)
${summary}`
  }

  if (vizConfig) {
    const { x_axis, y_axis, series_name } = vizConfig
    const configDesc = [
      x_axis ? `- X-Axis (Dimension): ${x_axis}` : '',
      y_axis
        ? `- Y-Axis (Metric): ${Array.isArray(y_axis) ? y_axis.join(', ') : y_axis}`
        : '',
      series_name ? `- Series: ${series_name}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    if (configDesc) {
      userPrompt += `

### Visualization Config
${configDesc}`
    }
  }

  if (sql) {
    userPrompt += `

### SQL Query (Context)
${sql}`
  }

  userPrompt += `

### Aggregated Data (${aggregatedData.length} points)
${dataStr}`

  if (userInstructions && userInstructions.trim()) {
    userPrompt += `

### 💡 SPECIFIC INSTRUCTIONS
The user has provided the following guidance for this analysis:
"${userInstructions}"
Please prioritize these instructions.`
  }

  userPrompt += `

### Your Analysis (JSON)`

  const body: ChatCompletionCreateParamsNonStreaming = {
    model: getModelToUse(model),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  }

  const { data } = await callAIAndParse(openai, body, InsightResultSchema)

  return autospaceInsight(data)
}
