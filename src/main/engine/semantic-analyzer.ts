import { OpenAI } from 'openai'
import { ColumnSchema, SemanticAnalysisResult } from '@shared/types'
import { callAIAndParse } from './ai-utils'
import { z } from 'zod'

const businessTypes = [
  'ID',
  'Code',
  'Money',
  'Category',
  'Date',
  'Time',
  'Quantity',
  'Location',
  'Text',
  'Other',
] as const

const SemanticResultSchema = z.object({
  columns: z.record(z.string(), z.object({
    aliases: z.array(z.string()),
    businessType: z.enum(businessTypes),
    description: z.string(),
    usageType: z.enum(['Dimension', 'Measure', 'Attribute']).optional(),
    defaultAggregation: z.enum(['SUM', 'AVG', 'COUNT', 'MAX', 'NONE']).optional(),
    confidence: z.number().min(0).max(1).optional(),
    reason: z.string().optional(),
    extractionHints: z.array(z.object({
      targetColumnName: z.string(),
      prompt: z.string(),
      reason: z.string()
    })).optional()
  })),
  metrics: z.array(z.object({
    name: z.string(),
    sqlExpression: z.string(),
    description: z.string(),
    reason: z.string(),
    confidence: z.number().min(0).max(1).optional(),
    semantic: z.object({
      aliases: z.array(z.string()),
      businessType: z.string(),
      usageType: z.enum(['Dimension', 'Measure', 'Attribute']).optional(),
      defaultAggregation: z.enum(['SUM', 'AVG', 'COUNT', 'MAX', 'NONE']).optional(),
    }).optional()
  })).optional()
})

/**
 * AI Powered Semantic Analysis Engine
 * Uses LLM to infer column meanings, generate aliases, and suggest metrics.
 */
export async function analyzeSemantics(
  client: OpenAI,
  model: string,
  tableName: string,
  columns: ColumnSchema[],
  language: string = 'Chinese (Simplified)'
): Promise<SemanticAnalysisResult> {
  // Use existing sample values and semantic info
  const columnContext = columns.map((col) => {
    return {
      name: col.name,
      type: col.type,
      samples: col.sampleValues?.slice(0, 5) || [],
      existingSemantic: col.semantic || null,
      source: col.sourceType || 'raw'
    }
  })

  const systemPrompt = `You are a Data Analyst and Business Intelligence expert. 
Your task is to analyze a database table schema and sample data to provide semantic metadata and PROACTIVE insights.

### CORE PRINCIPLES:
1. **RESPECT EXISTING METADATA**: If a column already has "existingSemantic" (aliases, description), your goal is to REFINE or ENHANCE it. Do not change it significantly unless it is clearly wrong.
2. **INCREMENTAL IMPROVEMENT**: Focus on filling gaps (e.g., adding missing descriptions or aggregation hints).
3. **SYSTEM ISOLATION**: Ignore any system columns starting with \`_ws_\` (already filtered but be aware).

### STEP 1: Column Analysis
For each column, you must:
1. Infer its business meaning (Description). **IMPORTANT**: The description MUST be in ${language}.
2. Suggest 2-3 natural language synonyms/aliases in ${language}. 
   - **IMPORTANT**: The FIRST alias MUST be the "Primary Display Name" (most professional and concise). 
   - Subsequent aliases should be synonyms to help the AI match user intents.
3. Assign a high-level Business Category (businessType). Choose EXACTLY one from this list:
   - ID: Technical primary/foreign keys (e.g. 1, 2, UUID). Used for JOINs.
   - Code: Business-facing identifiers (e.g. SKU-001, Order_No). Used for searching and labels.
   - Money: Financial values, currency.
   - Category: Dimensions, groups, types.
   - Date: Calendar dates or timestamps.
   - Time: Time of day only.
   - Quantity: Measurable counts (not money).
   - Location: Geography info.
   - Text: Descriptive text, names, titles.
   - Other: Anything else.

4. Assign a usageType (Dimension/Measure/Attribute).
5. Suggest a defaultAggregation (SUM/AVG/COUNT/MAX/NONE).
6. **Assign a confidence score (0.0 to 1.0)** based on how certain you are of the business meaning.
7. **Provide a brief reason (in ${language})** for your categorization.

8. **AI Extraction Hints**: If a column contains semi-structured or complex text (like addresses, SKU names with attributes, log messages), suggest how to extract structured data.

### STEP 2: Metric Suggestions
Identify business metrics that can be calculated **FOR EACH ROW** using columns in THIS table.
- **CRITICAL CONSTRAINT**: ONLY suggest row-level expressions (Calculated Columns).
- **STRICT FORBIDDEN**: NEVER use aggregate functions like SUM, AVG, COUNT, MIN, MAX.
- **STRICT FORBIDDEN**: NEVER use \`SELECT\`, \`FROM\`, \`JOIN\`, or subqueries.
- **ROBUSTNESS**: Use \`NULLIF(col, 0)\` to prevent division-by-zero errors in ratio calculations.
- **NAMING**: Use professional business terms in ${language} (e.g., "毛利率", "单均价").
- **METRIC SEMANTICS**: For every suggested metric, provide its own "semantic" metadata (aliases, businessType, usageType).

OUTPUT RULE:
1. Return ONLY a valid JSON object matching the requested schema.
2. All explanations, names, and descriptions MUST be in ${language}.
3. **CRITICAL**: The "businessType", "usageType", and "defaultAggregation" MUST be exact strings from the provided lists.
4. **CRITICAL**: The "sqlExpression" in "metrics" MUST be a valid row-level SQL fragment. ALWAYS wrap column names in double quotes (").

Example Output Structure:
{
  "columns": {
    "amt": {
      "aliases": ["销售额", "收入"],
      "businessType": "Money",
      "description": "该笔交易的总销售金额",
      "usageType": "Measure",
      "defaultAggregation": "SUM",
      "confidence": 0.95,
      "reason": "..."
    }
  },
  "metrics": [
    {
      "name": "利润",
      "sqlExpression": "\\"revenue\\" - \\"cost\\"",
      "description": "该笔交易的净利润",
      "reason": "...",
      "confidence": 0.9,
      "semantic": {
        "aliases": ["净利", "Net Profit"],
        "businessType": "Money",
        "usageType": "Measure",
        "defaultAggregation": "SUM"
      }
    }
  ]
}
`

  const userPrompt = `Table Name: ${tableName}
Columns and Samples:
${JSON.stringify(columnContext, null, 2)}`

  const { data } = await callAIAndParse(client, {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0
  }, SemanticResultSchema)

  return data
}
