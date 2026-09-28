import { OpenAI } from 'openai'
import { callAIAndParse } from './ai-utils'
import { z } from 'zod'
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources'

/**
 * Data Extraction Engine [C2]
 * Responsible for unstructured data extraction prompt engineering and parsing.
 */
export async function previewExtraction(
  client: OpenAI,
  model: string,
  inputData: unknown[],
  prompt: string
): Promise<{ results: string[]; usage?: { input: number; output: number } }> {
  const inputsStr = inputData.map((v, i) => `${i + 1}. ${String(v)}`).join('\n')
  const systemPrompt = `You are a data extraction engine. Process inputs and return a JSON object with a "results" key containing an array of strings matching the input order. Format: { "results": ["Result1", "Result2"] }`
  const userPrompt = `Instruction: ${prompt}\n\nInputs:\n${inputsStr}`

  try {
    const body: ChatCompletionCreateParamsNonStreaming = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      response_format: { type: 'json_object' }
    }

    const { data, usage } = await callAIAndParse(client, body, z.object({ results: z.array(z.string()) }))

    return { 
      results: data.results, 
      usage: usage ? { input: usage.prompt_tokens, output: usage.completion_tokens } : undefined 
    }
  } catch (e) {
    console.error('[Extractor] Failed to parse extraction preview', e)
    return { results: [] }
  }
}