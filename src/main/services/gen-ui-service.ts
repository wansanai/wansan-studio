import { OpenAI } from 'openai'
import { PROMPT_ANALYST, PROMPT_DESIGNER } from '../engine/prompts/gen-ui'
import { 
  InsightPayload, 
  InsightPayloadSchema, 
  GenUIPayload, 
  GenUIPayloadSchema,
  NaturalComponentSpec,
  GenUIResponse
} from '@shared/schemas/gen-ui'
import { extractJSON, parseAIResponse } from '@shared/utils/json-utils'
import { safeStringify } from '@shared/serialization'
import { isDev } from '../utils/env'

export class GenUIService {
  constructor(private openai: OpenAI, private model: string = 'gpt-4-turbo-preview') {}

  /**
   * Two-step generation flow:
   * 1. Data -> Insight (The Brain)
   * 2. Insight -> Component (The Hand)
   */
  async generateSemanticUI(
    data: any[],
    userQuery: string,
    blueprint?: NaturalComponentSpec
  ): Promise<GenUIResponse> {
    // Phase 1: Analyst (The Brain)
    const insight = await this.generateInsight(data, userQuery)

    // Phase 2: Designer (The Hand)
    const genSpec = await this.generateComponent(insight, blueprint || this.getDefaultBlueprint())

    return { 
      spec: genSpec, 
      insight, 
      reasoning: insight.summary // Use summary as primary reasoning
    }
  }

  private async generateInsight(data: any[], userQuery: string): Promise<InsightPayload> {
    // Prompt Pruning: Limit data to top 20 rows for analyst
    const dataSlice = data.slice(0, 20)
    
    const userPrompt = `### USER QUERY\n"${userQuery}"\n\n### DATA SAMPLE (Rows: ${data.length})\n${safeStringify(dataSlice, 2)}`

    if (isDev()) {
      console.log('[GenUI] Phase 1 (Analyst) Prompt:', userPrompt)
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: PROMPT_ANALYST },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0].message.content || '{}'
      if (isDev()) {
        console.log('[GenUI] Phase 1 (Analyst) Response:', content)
      }
      const rawInsight = parseAIResponse<any>(content)
      
      // Validation with Fallback
      const result = InsightPayloadSchema.safeParse(rawInsight)
      if (result.success) {
        return result.data
      } else {
        console.warn('[GenUI] Insight validation failed, falling back to neutral.', result.error)
        return this.getNeutralFallbackInsight(userQuery)
      }
    } catch (err) {
      console.error('[GenUI] Phase 1 failed:', err)
      return this.getNeutralFallbackInsight(userQuery)
    }
  }

  private async generateComponent(insight: InsightPayload, blueprint: NaturalComponentSpec): Promise<GenUIPayload> {
    const userPrompt = `### INSIGHT CONTEXT\n${JSON.stringify(insight, null, 2)}\n\n### VISUAL BLUEPRINT\n"${blueprint.visual_blueprint}"`

    if (isDev()) {
      console.log('[GenUI] Phase 2 (Designer) Prompt:', userPrompt)
    }

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: PROMPT_DESIGNER },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    })

    const content = response.choices[0].message.content || '{}'
    if (isDev()) {
      console.log('[GenUI] Phase 2 (Designer) Response:', content)
    }
    const rawPayload = parseAIResponse<GenUIPayload>(content)
    
    return GenUIPayloadSchema.parse(rawPayload)
  }

  private getDefaultBlueprint(): NaturalComponentSpec {
    return {
      id: 'std-card',
      name: 'Standard Insight Card',
      visual_blueprint: `
        Create a high-impact BI card.
        Header: Bold title and a semantic icon.
        Main area: Prominent display of the primary metric.
        Visualization: ECharts mini-chart (smooth area or line).
        Summary: A concise explanatory paragraph.
        Colors: Map sentiment directly to theme (Critical=Red, Positive=Green, etc.).
      `,
      data_slots: {
        dimensions: [],
        measures: []
      }
    }
  }

  private getNeutralFallbackInsight(query: string): InsightPayload {
    return {
      sentiment: 'neutral',
      primary_metric: {
        label: 'Analysis Result',
        value: '---',
        trend: { direction: 'neutral', value: '0%', is_good: true }
      },
      summary: `I've analyzed the data for "${query}", but couldn't extract specific critical insights. Displaying overview instead.`, 
      viz_suggestion: {
        type: 'line',
        reason: 'Defaulting to trend line for safety.'
      }
    }
  }
}
