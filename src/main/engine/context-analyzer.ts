import { OpenAI } from 'openai'
import {
  AIAnalysisContext,
  ContextAnalysisResult,
  TableSchema,
} from '@shared/types.ts'
import {
  AnalysisResult,
  AnalysisResultSchema,
  ContextAnalysisResultSchema,
} from '@shared/schemas/analysis.ts'
import {
  CONTEXT_ANALYSIS_SYSTEM_PROMPT,
  getAnalysisSystemPrompt,
  serializeSchemas,
} from './prompts.ts'
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources'
import { callAIAndParse, getModelToUse } from './ai-utils'

/**
 * [C3, C4, C5] Analyze Context Engine
 * Responsible for understanding schema relationships, inferring metrics, and generating analysis plans.
 */

/**
 * Generate a specific analysis plan based on user query and schema.
 */
export async function generateAnalysis(
  openai: OpenAI,
  context: AIAnalysisContext,
  model?: string
): Promise<AnalysisResult> {
  const {
    userQuery,
    schemas,
    prevContext,
    language = 'en',
    domainRules = [],
    suggestionCount = 3,
  } = context

  const schemaContext = serializeSchemas(schemas)
  const currentDate = new Date().toISOString().split('T')[0]

  // [NEW] Aggregate relationships from all schemas
  const allRelations = schemas.flatMap(s => s.relations || [])

  const relationsContext =
    allRelations.length > 0
      ? allRelations
          .map(
            r =>
              `- Table "${r.sourceTable}" can act as Fact Table, joining to Dimension Table "${r.targetTable}" via: ON "${r.sourceTable}"."${r.sourceColumn}" = "${r.targetTable}"."${r.targetColumn}"`
          )
          .join('\n')
      : 'No specific relationships defined. Infer joins if necessary based on column names.'

  let contextSection = ''
  if (prevContext && prevContext.lastSql && prevContext.lastQuery) {
    contextSection = `
### 🕒 PREVIOUS CONTEXT
Last Query: "${prevContext.lastQuery}"
Last SQL: "${prevContext.lastSql.replace(/\s+/g, ' ').trim()}"`
  }

  const userPrompt = `### 📅 CONTEXT
Current Date: ${currentDate}

### 📂 DATABASE SCHEMA
The following tables are available in the local DuckDB instance:

${schemaContext}

### 🔗 KNOWN RELATIONSHIPS (HINT FOR JOINING)
Use these valid relationships to join tables if the user query requires data from multiple sources.
${relationsContext}${contextSection}
### 👤 USER QUESTION
"${userQuery}"

### 🤖 YOUR RESPONSE (JSON)`

  const languageNote = language === 'zh' ? 'Chinese (Simplified)' : 'English'

  const body: ChatCompletionCreateParamsNonStreaming = {
    model: getModelToUse(model),
    messages: [
      {
        role: 'system',
        content: `${getAnalysisSystemPrompt(domainRules, language, suggestionCount)}

OUTPUT RULE:
1. The "summary", "title", "reasoning", and "suggestions" fields MUST be in ${languageNote}.
2. **CRITICAL**: DO NOT mention "Smart Filter" or any technical internal mechanisms in the "reasoning" field. Focus on business logic and data interpretation for the end user.`,
      },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  }

  const { data } = await callAIAndParse(openai, body, AnalysisResultSchema)
  return data
}

/**
 * Analyze multiple table schemas to deduce relationships and starter prompts.
 */
export async function analyzeContext(
  openai: OpenAI,
  schemas: TableSchema[],
  model?: string,
  language: 'en' | 'zh' = 'en'
): Promise<ContextAnalysisResult> {
  const schemaContext = serializeSchemas(schemas)
  const languageNote = language === 'zh' ? 'Chinese (Simplified)' : 'English'

  const userPrompt = `### 📂 DATABASE SCHEMA
The following table schemas are available. Please analyze them.

${schemaContext}

### 🤖 YOUR RESPONSE (JSON)
`

  const body: ChatCompletionCreateParamsNonStreaming = {
    model: getModelToUse(model),
    messages: [
      {
        role: 'system',
        content: `${CONTEXT_ANALYSIS_SYSTEM_PROMPT}

OUTPUT RULE:
1. The "suggestedPrompts" MUST be written in ${languageNote}.
2. The "reason" field in "relationships" MUST be written in ${languageNote}.`,
      },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  }

  const { data } = await callAIAndParse(openai, body, ContextAnalysisResultSchema)
  return data
}
