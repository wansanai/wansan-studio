import { OpenAI } from 'openai'
import { TableSchema, DomainRule } from '@shared/types.ts'
import { FixSQLResultSchema } from '@shared/schemas/analysis.ts'
import { serializeSchemas, getFixSystemPrompt } from './prompts.ts'
import { callAIAndParse, getModelToUse } from './ai-utils'
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources'

/**
 * SQL Repair Engine
 * Responsible for fixing broken SQL queries.
 */
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
${getFixSystemPrompt(domainRules)}

OUTPUT: JSON object { 
  "sql": "FIXED_SQL", 
  "reasoning": "Brief explanation of the fix (supplementary to the original plan)",
  "is_template": boolean, // (Optional) Set to true if using placeholders
  "missing_params": [ { "placeholder": "...", "label": "...", "column": "...", "table": "...", "hint": "..." } ] // (Optional) Parameters if is_template is true
}`

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

  const { data } = await callAIAndParse(openai, body, FixSQLResultSchema)
  return data
}
