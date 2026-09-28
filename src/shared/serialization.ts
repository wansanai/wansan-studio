import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { ColumnType } from './types'

/**
 * Unified serialization utilities for handling JSON.stringify/parse with special types
 */

/**
 * Custom JSON replacer function that handles BigInt serialization
 */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString() + 'n'
  }
  return value
}

/**
 * Custom JSON reviver function that handles BigInt deserialization
 */
export function jsonReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && /^\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1))
  }
  return value
}

/**
 * Stringify an object with BigInt support
 */
export function stringify(data: unknown, space?: string | number): string {
  return JSON.stringify(data, jsonReplacer, space)
}

/**
 * Parse a JSON string with BigInt support
 */
export function parse<T = unknown>(json: string): T {
  return JSON.parse(json, jsonReviver) as T
}

/**
 * Create a custom storage object for zustand persist middleware
 * that handles BigInt serialization
 */
export function createBigIntStorage<S>(
  storage: Storage = localStorage
): PersistStorage<S> {
  return {
    getItem: (name: string) => {
      const str = storage.getItem(name)
      if (!str) return null
      try {
        return parse<StorageValue<S>>(str)
      } catch (e) {
        console.error('Failed to parse storage item:', e)
        return null
      }
    },
    setItem: (name: string, value: StorageValue<S>) => {
      try {
        const str = stringify(value)
        storage.setItem(name, str)
      } catch (e) {
        console.error('Failed to stringify storage item:', e)
      }
    },
    removeItem: (name: string) => storage.removeItem(name),
  }
}

/**
 * Safely stringify for display/logging purposes
 * Handles circular references and BigInt
 */
export function safeStringify(data: unknown, space?: string | number): string {
  const seen = new WeakSet()

  return JSON.stringify(
    data,
    (_key, value) => {
      // Handle BigInt
      if (typeof value === 'bigint') {
        return value.toString() + 'n'
      }

      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]'
        }
        seen.add(value)
      }

      return value
    },
    space
  )
}

/**
 * Summarize a JSON object for token-efficient LLM context
 * - Limits recursion depth
 * - Truncates arrays to first element
 * - Limits object keys
 * - Truncates long strings
 */
export function summarizeJson(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value

  // Limit recursion depth to save tokens on deep nesting
  if (depth > 3) {
    if (Array.isArray(value)) return '[...]'
    if (typeof value === 'object') return '{...}'
    // For primitives, allow fall-through to handle string truncation
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return []
    // Only keep the first item to show structure
    return [summarizeJson(value[0], depth + 1)]
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
    const summary: Record<string, unknown> = {}
    const MAX_KEYS = 8 // Limit number of keys shown

    keys.slice(0, MAX_KEYS).forEach(k => {
      summary[k] = summarizeJson(
        (value as Record<string, unknown>)[k],
        depth + 1
      )
    })

    if (keys.length > MAX_KEYS) {
      summary['...'] = `(${keys.length - MAX_KEYS} more keys)`
    }

    return summary
  }

  // Truncate long strings within JSON
  if (typeof value === 'string') {
    if (value.length > 50) {
      return value.substring(0, 50) + '...'
    }
  }

  return value
}

/**
 * Standardize Date/Time values to a clean string format for AI
 * Handles Date objects and valid date strings.
 * Returns only the necessary parts based on type hints if possible.
 */
export function formatDateValue(
  val: unknown,
  typeHint?: 'date' | 'time' | 'timestamp'
): string | null {
  if (val === null || val === undefined) return null

  let dateObj: Date | null = null

  if (val instanceof Date) {
    dateObj = val
  } else if (typeof val === 'number' || typeof val === 'bigint') {
    let numVal = typeof val === 'bigint' ? Number(val) : val

    // Heuristic: DuckDB timestamps are often in microseconds
    // If > 10^14, it's likely microseconds (10^12 is ~1970 in ms, 10^15 is ~5000 in ms)
    if (numVal > 100000000000000) {
      numVal = Math.floor(numVal / 1000)
    }

    const d = new Date(numVal)
    if (!isNaN(d.getTime())) {
      dateObj = d
    }
  } else if (typeof val === 'string') {
    // Check if string is a numeric timestamp
    if (/^\d+$/.test(val)) {
      const numVal = Number(val)
      // Apply same microsecond heuristic for numeric strings
      const finalVal =
        numVal > 100000000000000 ? Math.floor(numVal / 1000) : numVal
      dateObj = new Date(finalVal)
    } else {
      // If it's already a clean date string (YYYY-MM-DD) and typeHint is date, return it
      if (typeHint === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        return val
      }
      // If it's an ISO-like string (YYYY-MM-DDTHH:mm:ss...) or SQL-like (YYYY-MM-DD HH:mm:ss)
      if (
        (typeHint === 'timestamp' || typeHint === 'date') &&
        /^\d{4}-\d{2}-\d{2}[T ]/.test(val)
      ) {
        if (typeHint === 'date') return val.split(/[T ]/)[0]
        return val.replace('T', ' ').split('.')[0]
      }

      const d = new Date(val)
      if (!isNaN(d.getTime())) {
        dateObj = d
      }
    }
  }

  if (dateObj && !isNaN(dateObj.getTime())) {
    const isNumeric = typeof val === 'number' || typeof val === 'bigint'

    if (isNumeric) {
      // Numeric: Treat as UTC to preserve DuckDB naive timestamp value
      const iso = dateObj.toISOString()
      if (typeHint === 'date') return iso.split('T')[0]
      if (typeHint === 'time') return iso.split('T')[1].split('.')[0]
      return iso.replace('T', ' ').split('.')[0]
    } else {
      // String/Date Object: Treat as Local to preserve literal value
      const year = dateObj.getFullYear()
      const month = String(dateObj.getMonth() + 1).padStart(2, '0')
      const day = String(dateObj.getDate()).padStart(2, '0')
      const hours = String(dateObj.getHours()).padStart(2, '0')
      const minutes = String(dateObj.getMinutes()).padStart(2, '0')
      const seconds = String(dateObj.getSeconds()).padStart(2, '0')

      if (typeHint === 'date') return `${year}-${month}-${day}`
      if (typeHint === 'time') return `${hours}:${minutes}:${seconds}`
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }
  }
  return null
}

/**
 * Format a value for display in UI (tables, big numbers, etc.)
 * Handles timestamps, floating point numbers (fixed precision), and generic strings.
 */
export function formatForDisplay(value: unknown, typeHint?: string): string {
  if (value === null || value === undefined) return '—'

  if (typeHint) {
    const upperHint = typeHint.toUpperCase()
    if (upperHint.includes('TIMESTAMP') || upperHint.includes('DATETIME')) {
      return formatDateValue(value, 'timestamp') || String(value)
    }
    if (upperHint.includes('DATE')) {
      return formatDateValue(value, 'date') || String(value)
    }
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    const numValue = typeof value === 'bigint' ? Number(value) : value
    const isSafe =
      typeof value === 'bigint'
        ? value <= BigInt(Number.MAX_SAFE_INTEGER) &&
          value >= BigInt(Number.MIN_SAFE_INTEGER)
        : true

    // For UI display, we keep a mild heuristic for dates but prioritize number formatting
    const minTimestamp = 946684800000 // 2000-01-01
    const maxTimestamp = 1893456000000 // 2030-01-01

    // Only format as date if it's clearly in ms timestamp range AND not a small integer
    if (isSafe && (numValue as number) >= minTimestamp && (numValue as number) <= maxTimestamp) {
      try {
        return new Date(numValue as number).toLocaleString()
      } catch {
        /* fall through */
      }
    }

    if (!isSafe) {
      return value.toString()
    }

    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 4,
    }).format(numValue as number)
  }

  // Handle Objects / Arrays (JSON data)
  if (typeof value === 'object' && value !== null) {
    try {
      const str = JSON.stringify(value)
      return str.length > 100 ? str.substring(0, 100) + '...' : str
    } catch {
      return '[Complex Data]'
    }
  }

  return String(value)
}

/**
 * Process a single value for LLM context sampling
 * Handles: BigInt, Date (ISO), JSON summarization, and string truncation
 */
export function processSampleValue(val: unknown, columnType?: ColumnType): unknown {
  // 1. Handle Date/Time Types if columnType is provided
  // We prioritize this over generic numeric checks because DuckDB often returns
  // timestamps as bigints (microseconds).
  if (columnType === 'DATE' || columnType === 'TIMESTAMP') {
    const formattedDate = formatDateValue(
      val,
      columnType === 'DATE' ? 'date' : 'timestamp'
    )
    if (formattedDate) return formattedDate
  }

  // 2. Strict Type Check: If it's a numeric type, NEVER format as date fallback
  // const isNumericType = columnType === 'INTEGER' || columnType === 'DOUBLE'

  // 3. Handle BigInt (Generic fallback)
  if (typeof val === 'bigint') {
    return val.toString()
  }

  // 4. Handle Float: keep 4 decimal places
  if (typeof val === 'number') {
    return Math.round(val * 10000) / 10000
  }

  // 5. Handle Object/Array - treat as JSON
  if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
    try {
      const summary = summarizeJson(val)
      return JSON.stringify(summary)
    } catch {
      return String(val)
    }
  }

  // 6. Handle String (check for JSON)
  if (typeof val === 'string') {
    const MAX_LEN = 50

    // Attempt to identify and summarize JSON
    const trimmed = val.trim()
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(val)
        const summary = summarizeJson(parsed)
        return JSON.stringify(summary)
      } catch {
        // Try to handle unescaped JSON
        try {
          const unescaped = val.replace(/\\"/g, '"')
          const parsed = JSON.parse(unescaped)
          const summary = summarizeJson(parsed)
          return JSON.stringify(summary)
        } catch {
          // Ignore parse errors
        }
      }
    }

    if (val.length > MAX_LEN) {
      return val.substring(0, MAX_LEN) + '...'
    }
  }

  return val
}

/**
 * Sanitize values for IPC transmission and general usage.
 * - Converts BigInt to number (if safe) or string (if unsafe)
 * - Rounds floating point numbers
 * - Converts Date to timestamp
 * - Recursively handles Arrays and Objects
 */
export function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const num = Number(value)
    return Number.isSafeInteger(num) ? num : value.toString()
  }
  if (typeof value === 'number') {
    // Round to 6 decimal places to avoid floating point artifacts (e.g. 0.1 + 0.2)
    // and keep JSON payload cleaner. 6 is enough for most BI cases.
    if (!Number.isInteger(value)) {
      return Math.round(value * 1000000) / 1000000
    }
    return value
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue)
  }
  if (value !== null && typeof value === 'object') {
    const plain: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      plain[key] = sanitizeValue((value as Record<string, unknown>)[key])
    }
    return plain
  }
  return value
}