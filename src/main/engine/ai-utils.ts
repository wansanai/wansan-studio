import { OpenAI } from 'openai'
import {
  ChatCompletionCreateParamsNonStreaming,
  CompletionUsage,
} from 'openai/resources'
import { ZodSchema } from 'zod'
import { isDev } from '../utils/env'
import { extractJSON } from '@shared/utils/json-utils'
import { parse } from '@shared/serialization'

/**
 * Heuristic for token estimation when tiktoken is not available.
 * - English: ~4 chars per token
 * - Chinese: ~1.5 chars per token
 */
export const CHARS_PER_TOKEN_EN = 4
export const CHARS_PER_TOKEN_ZH = 1.5

export interface AIResponse<T> {
  data: T
  usage: CompletionUsage | undefined
}

/**
 * Resolves which AI model to use based on preference and environment variables.
 */
export function getModelToUse(preferredModel?: string): string {
  const envModel = process.env.OPENAI_MODEL
  if (isDev()) {
    console.log('[AI Utils] getModelToUse debug:', {
      preferredModel,
      envModel,
      allEnvKeys: Object.keys(process.env).filter(k => k.startsWith('OPENAI')),
    })
  }
  return preferredModel || envModel
}

/**
 * Universal helper to call OpenAI and parse/validate the response.
 * Returns an object containing both the validated data and usage stats.
 */
export async function callAIAndParse<T>(
  openai: OpenAI,
  body: ChatCompletionCreateParamsNonStreaming,
  schema: ZodSchema<T>
): Promise<AIResponse<T>> {
  if (isDev()) {
    console.log('[AI Utils] Request Body:', JSON.stringify(body, null, 2))
  }

  const response = await openai.chat.completions.create(body)
  const resultJson = response.choices[0].message.content

  if (!resultJson) {
    throw new Error('AI returned an empty response.')
  }

  if (isDev()) {
    console.log('[AI Utils] Raw Response:', resultJson)
  }

  try {
    const cleanedJson = extractJSON(resultJson)
    const parsedResult = parse(cleanedJson)
    const data = schema.parse(parsedResult)

    return {
      data,
      usage: response.usage,
    }
  } catch (error) {
    console.error('[AI Utils] Failed to parse or validate AI response:', error)
    throw new Error(
      `AI returned invalid JSON or structure. Raw response: ${resultJson}`
    )
  }
}
