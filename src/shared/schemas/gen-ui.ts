import { z } from 'zod'

export const InsightPayloadSchema = z.object({
  sentiment: z.enum(['critical', 'warning', 'positive', 'neutral']),
  primary_metric: z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    trend: z.object({
      direction: z.enum(['up', 'down', 'neutral']),
      value: z.string(),
      is_good: z.boolean(),
    }),
  }),
  summary: z.string(),
  suggestion: z.string().optional(),
  viz_suggestion: z.object({
    type: z.string(),
    reason: z.string(),
  }),
})

export type InsightPayload = z.infer<typeof InsightPayloadSchema>

export const NaturalComponentSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  visual_blueprint: z.string().describe('The prompt instructions'),
  data_slots: z.object({
    dimensions: z.array(z.string()),
    measures: z.array(z.string()),
  }),
})

export type NaturalComponentSpec = z.infer<typeof NaturalComponentSpecSchema>

export const GenUIPayloadSchema = z.object({
  html: z.string().describe('Tailwind markup'),
  js: z.string().describe('Function body'),
  data_signature: z.any().optional(),
})

export type GenUIPayload = z.infer<typeof GenUIPayloadSchema>

export interface GenUIResponse {
  spec: GenUIPayload
  reasoning: string
  insight?: InsightPayload
}
