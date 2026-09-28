import { z } from 'zod'

export const ParamSchema = z.object({
  placeholder: z.string().describe('The placeholder in SQL, e.g., {{CITY}}'),
  label: z
    .string()
    .optional()
    .describe('Human readable label for the parameter'),
  column: z.string().describe('Target column name for distinct query'),
  table: z.string().describe('Target table name for distinct query'),
  display_columns: z
    .array(z.string())
    .optional()
    .describe('Columns to display for better context'),
  hint: z.string().optional().describe('Fuzzy search term provided by user'),
})

export type FilterParam = z.infer<typeof ParamSchema>

export const AnalysisResultSchema = z.object({
  sql: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  viz_type: z
    .enum(['bar', 'line', 'pie', 'table', 'scatter', 'kpi', 'area', 'text'])
    .optional(),
  viz_config: z
    .object({
      x_axis: z.string().nullable().optional(),
      y_axis: z
        .union([z.string(), z.array(z.string())])
        .nullable()
        .optional(),
      series_name: z
        .union([z.string(), z.array(z.string())])
        .nullable()
        .optional(),
      split_by: z
        .string()
        .nullable()
        .optional()
        .describe('The column used to split a single metric into multiple series, e.g. "Category"'),
    })
    .optional(),
  reasoning: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  error: z.string().optional(),

  // v1.2 Smart Filter Fields
  is_template: z.boolean().optional().default(false),
  missing_params: z.array(ParamSchema).optional(),
})

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>

export const RelationSuggestionSchema = z.object({
  sourceTable: z.string(),
  sourceColumn: z.string(),
  targetTable: z.string(),
  targetColumn: z.string(),
  confidence: z.number().min(0.0).max(1.0),
  reason: z.string(),
})

export const SmartMetricSchema = z.object({
  name: z.string().describe('Business name, e.g. "Profit Margin"'),
  sqlExpression: z
    .string()
    .describe('DuckDB SQL expression, e.g. "profit / revenue"'),
  description: z.string().optional().describe('Brief explanation'),
  tableName: z.string().describe('The table this metric belongs to'),
  confidence: z.number().min(0.0).max(1.0).optional().default(0.8),
  reason: z.string().optional().describe('Why this metric was suggested'),
})

export const ContextAnalysisResultSchema = z.object({
  relationships: z.array(RelationSuggestionSchema),
  suggestedPrompts: z.array(z.string().max(60)),
})

export const FixSQLResultSchema = z.object({
  sql: z.string(),
  reasoning: z.string(),
  is_template: z.boolean().optional().default(false),
  missing_params: z.array(ParamSchema).optional(),
})

export const FindingSchema = z.object({
  id: z.string(),
  markdown: z.string(),
  sentiment: z
    .enum([
      'positive',
      'negative',
      'neutral',
      'warning',
      'growth',
      'discovery',
      'target',
      'info',
    ])
    .optional(),
  relatedItems: z.array(z.string()).optional(),
})

export const InsightResultSchema = z.object({
  summary: z.string(),
  findings: z.array(FindingSchema),
  recommendation: z.string().optional(),
})

export type InsightResult = z.infer<typeof InsightResultSchema>
