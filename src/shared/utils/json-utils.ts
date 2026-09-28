/**
 * Extracts and cleans JSON string from AI response.
 * It handles:
 * 1. Markdown code blocks (```json ... ```)
 * 2. Prefix/Suffix descriptive text (by finding the outermost balanced braces/brackets)
 */
export function extractJSON(rawContent: string): string {
  if (typeof rawContent !== 'string') {
    return typeof rawContent === 'object'
      ? JSON.stringify(rawContent)
      : String(rawContent)
  }

  let cleaned = rawContent.trim()

  // 1. Handle Markdown Code Blocks (```json ... ```)
  if (cleaned.includes('```')) {
    const markdownMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (markdownMatch && markdownMatch[1]) {
      cleaned = markdownMatch[1].trim()
    }
  }

  // 2. Find the outermost braces {} or brackets []
  const firstBrace = cleaned.indexOf('{')
  const firstBracket = cleaned.indexOf('[')

  let startIdx = -1
  let endChar = ''

  if (
    firstBrace !== -1 &&
    (firstBracket === -1 || (firstBrace !== -1 && firstBrace < firstBracket))
  ) {
    startIdx = firstBrace
    endChar = '}'
  } else if (firstBracket !== -1) {
    startIdx = firstBracket
    endChar = ']'
  }

  if (startIdx !== -1) {
    const lastIdx = cleaned.lastIndexOf(endChar)
    if (lastIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, lastIdx + 1)
    }
  }

  return cleaned
}

/**
 * Safely parses JSON returned by AI using the standard JSON.parse.
 * For BigInt support, use extractJSON() combined with your custom parse().
 */
export function parseAIResponse<T>(rawContent: unknown): T {
  if (typeof rawContent !== 'string') {
    // If it's already an object, assume it's already parsed
    if (typeof rawContent === 'object' && rawContent !== null) {
      return rawContent as T
    }
    return JSON.parse(String(rawContent)) as T
  }

  const cleaned = extractJSON(rawContent)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // If simple parse fails, try more robust ways or throw
    throw new Error('Failed to parse AI response as JSON')
  }
}
