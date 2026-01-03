import { OpenAI } from 'openai'
import {
  ContextAnalysisResult,
  DomainRule,
  RelationSuggestion,
  TableSchema,
} from '@shared/types.ts'
import {
  AnalysisResult,
  AnalysisResultSchema,
  ContextAnalysisResultSchema,
  FixSQLResultSchema,
  GenUIResponseSchema,
} from '@shared/schemas/analysis.ts'
import {
  CONTEXT_ANALYSIS_SYSTEM_PROMPT,
  getSystemPrompt,
  serializeSchemas,
} from './prompts.ts'
import { GEN_UI_SYSTEM_PROMPT } from './prompts/gen-ui-prompt.ts'
import { isDev } from '../utils/env'
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources'
import { parse, safeStringify } from '@shared/serialization.ts'
import { extractJSON } from '@shared/utils/json-utils'
import { GenUIResponseResult } from '@shared/schemas/analysis.ts'

function getModelToUse(preferredModel?: string) {
  const envModel = process.env.OPENAI_MODEL
  if (isDev()) {
    console.log('[AI Bridge] getModelToUse debug:', {
      preferredModel,
      envModel,
      allEnvKeys: Object.keys(process.env).filter(k => k.startsWith('OPENAI')),
    })
  }
  return preferredModel || envModel || 'gpt-4-turbo-preview'
}

export async function generateAnalysis(
  openai: OpenAI,
  userQuery: string,
  schemas: TableSchema[],
  relations: RelationSuggestion[],
  context?: { lastSql: string; lastQuery: string },
  model?: string,
  language: 'en' | 'zh' = 'en',
  domainRules: DomainRule[] = []
): Promise<AnalysisResult> {
  if (isDev()) {
    console.log(
      'generateAnalysis pre request - schemas:',
      safeStringify(schemas, 2)
    )
    console.log('generateAnalysis context:', context)
  }
  const schemaContext = serializeSchemas(schemas)
  const currentDate = new Date().toISOString().split('T')[0]

  const relationsContext =
    relations.length > 0
      ? relations
          .map(
            r =>
              `- Table "${r.sourceTable}" can act as Fact Table, joining to Dimension Table "${r.targetTable}" via: ON "${r.sourceTable}"."${r.sourceColumn}" = "${r.targetTable}"."${r.targetColumn}"`
          )
          .join('\n')
      : 'No specific relationships defined. Infer joins if necessary based on column names.'

  let contextSection = ''
  if (context && context.lastSql && context.lastQuery) {
    contextSection = `
### 🕒 PREVIOUS CONTEXT
Last Query: "${context.lastQuery}"
Last SQL: "${context.lastSql.replace(/\s+/g, ' ').trim()}"`
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
  const modelToUse = getModelToUse(model)

  const languageNote = language === 'zh' ? 'Chinese (Simplified)' : 'English'

  const body: ChatCompletionCreateParamsNonStreaming = {
    model: modelToUse,
    messages: [
      {
        role: 'system',
        content: `${getSystemPrompt(domainRules, language)}

OUTPUT RULE: The "summary", "title", "reasoning", and "suggestions" fields MUST be in ${languageNote}.`,
      },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  }
  if (isDev()) {
    console.log('generateAnalysis pre request - body', body)
  }
  const response = await openai.chat.completions.create(body)

  const resultJson = response.choices[0].message.content
  if (!resultJson) {
    throw new Error('AI returned an empty response.')
  }
  if (isDev()) {
    console.log('generateAnalysis post request - resultJson:', resultJson)
  }

  try {
    const cleanedJson = extractJSON(resultJson)
    const parsedResult = parse(cleanedJson)
    return AnalysisResultSchema.parse(parsedResult)
  } catch (error) {
    console.error('Failed to parse or validate AI response:', error)
    throw new Error(
      `AI returned invalid JSON or structure. Raw response: ${resultJson}`
    )
  }
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
  if (isDev()) {
    console.log(
      'analyzeContext pre request - schemas:',
      safeStringify(schemas, 2)
    )
  }

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

OUTPUT RULE: The "suggestedPrompts" MUST be written in ${languageNote}.`,
      },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  }
  if (isDev()) {
    console.log('analyzeContext pre request - body', body)
  }

  const response = await openai.chat.completions.create(body)

  const resultJson = response.choices[0].message.content
  if (!resultJson) {
    throw new Error('AI returned an empty response for context analysis.')
  }
  if (isDev()) {
    console.log('analyzeContext post request - resultJson:', resultJson)
  }

  try {
    const cleanedJson = extractJSON(resultJson)
    const rawResult = parse(cleanedJson)
    return ContextAnalysisResultSchema.parse(rawResult)
  } catch (error) {
    console.error(
      'Failed to parse or validate AI response for context analysis:',
      error
    )
    throw new Error(
      `AI returned invalid JSON or structure for context analysis. Raw response: ${resultJson}`
    )
  }
}

export async function fixSQL(
  openai: OpenAI,
  originalSql: string,
  errorMessage: string,
  schemas: TableSchema[],
  model?: string,
  domainRules: DomainRule[] = []
): Promise<{ sql: string; reasoning: string }> {
  const schemaContext = serializeSchemas(schemas)

  const systemPrompt = `You are a DuckDB SQL Repair Expert.
Your goal is to FIX a broken SQL query based on the error message and table schema.

Additional Context:
${getSystemPrompt(domainRules)}

OUTPUT: JSON object { "sql": "FIXED_SQL", "reasoning": "Brief explanation of the fix (supplementary to the original plan)" }`

  const userPrompt = `### 📂 SCHEMA
${schemaContext}

### ❌ BROKEN SQL
${originalSql}

### ⚠️ ERROR MESSAGE
${errorMessage}

### 🛠️ TASK
Fix the SQL. Ensure all table/column names are double-quoted and match the schema exactly.`

  const body: ChatCompletionCreateParamsNonStreaming = {
    model: getModelToUse(model),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  }
  if (isDev()) {
    console.log('fixSQL pre request - body', body)
  }

  const response = await openai.chat.completions.create(body)
  const resultJson = response.choices[0].message.content

  if (!resultJson) throw new Error('AI returned empty response for SQL fix')
  if (isDev()) {
    console.log('fixSQL post request - resultJson:', resultJson)
  }
  try {
    const cleanedJson = extractJSON(resultJson)
    return FixSQLResultSchema.parse(parse(cleanedJson))
  } catch (e) {
    throw new Error(`Failed to parse fix result: ${resultJson}`)
  }
}

export async function generateComponent(
  openai: OpenAI,
  userQuery: string,
  dataSample: any[],
  model?: string
): Promise<GenUIResponseResult> {
  const modelToUse = getModelToUse(model)
  const userPrompt = `User Query: "${userQuery}"\nData Sample (First 5 rows): ${safeStringify(
    dataSample.slice(0, 5),
    2
  )}`

  const body: ChatCompletionCreateParamsNonStreaming = {
    model: modelToUse,
    messages: [
      { role: 'system', content: GEN_UI_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  }

  if (isDev()) {
    console.log('[AI Bridge] generateComponent pre request - body:', body)
  }

  const response = await openai.chat.completions.create(body)
  const resultJson = response.choices[0].message.content

  if (!resultJson) {
    throw new Error('AI returned an empty response for GenUI generation.')
  }

  if (isDev()) {
    console.log('[AI Bridge] generateComponent post request - resultJson:', resultJson)
  }

  try {
    const cleanedJson = extractJSON(resultJson)
    const parsedResult = parse(cleanedJson)
    return GenUIResponseSchema.parse(parsedResult)
  } catch (error) {
    console.error('[AI Bridge] Failed to parse or validate GenUI response:', error)
    throw new Error(
      `AI returned invalid JSON or structure for GenUI. Raw response: ${resultJson}`
    )
  }
}
