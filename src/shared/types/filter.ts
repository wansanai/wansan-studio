export type LogicalOperator = 'AND' | 'OR'

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'is_null'
  | 'is_not_null'
  | 'in'
  | 'not_in'

export interface FilterCondition {
  id: string
  columnName: string
  columnType: string
  sourceType?: 'raw' | 'ai' | 'metric' | 'joined'
  operator: FilterOperator
  value: unknown
  enabled: boolean
}

export interface FilterState {
  conjunction: LogicalOperator
  conditions: FilterCondition[]
}

export type FilterValidationCode =
  | 'value_required'
  | 'range_required'
  | 'range_invalid'
  | 'list_required'

export interface FilterValidationIssue {
  conditionId: string
  code: FilterValidationCode
}

// Deprecated: old FilterRule for migration compatibility
export type FilterRule = FilterCondition

export const OPERATOR_CONFIG: Record<FilterOperator, { label: string; symbol?: string; validTypes: string[]; inputType: 'text' | 'number' | 'date' | 'none' | 'multi' | 'range' }> = {
  equals: { label: '等于', symbol: '=', validTypes: ['text', 'number', 'date', 'boolean'], inputType: 'text' },
  not_equals: { label: '不等于', symbol: '!=', validTypes: ['text', 'number', 'date', 'boolean'], inputType: 'text' },
  contains: { label: '包含', validTypes: ['text'], inputType: 'text' },
  not_contains: { label: '不包含', validTypes: ['text'], inputType: 'text' },
  starts_with: { label: '开头是', validTypes: ['text'], inputType: 'text' },
  ends_with: { label: '结尾是', validTypes: ['text'], inputType: 'text' },
  gt: { label: '大于', symbol: '>', validTypes: ['number', 'date'], inputType: 'number' },
  gte: { label: '大于等于', symbol: '>=', validTypes: ['number', 'date'], inputType: 'number' },
  lt: { label: '小于', symbol: '<', validTypes: ['number', 'date'], inputType: 'number' },
  lte: { label: '小于等于', symbol: '<=', validTypes: ['number', 'date'], inputType: 'number' },
  between: { label: '介于', validTypes: ['number', 'date'], inputType: 'range' },
  is_null: { label: '为空', validTypes: ['text', 'number', 'date', 'boolean'], inputType: 'none' },
  is_not_null: { label: '不为空', validTypes: ['text', 'number', 'date', 'boolean'], inputType: 'none' },
  in: { label: '在列表中', validTypes: ['text', 'number', 'date'], inputType: 'multi' },
  not_in: { label: '不在列表中', validTypes: ['text', 'number', 'date'], inputType: 'multi' },
}

// Legacy export for compatibility, map to OPERATOR_CONFIG
export const OPERATORS = OPERATOR_CONFIG

export function getSimpleType(dbType: string): 'text' | 'number' | 'date' | 'boolean' {
  const t = dbType.toUpperCase()
  if (['INT', 'BIGINT', 'DOUBLE', 'DECIMAL', 'FLOAT', 'NUMBER', 'REAL', 'INTEGER'].some(k => t.includes(k))) return 'number'
  if (['DATE', 'TIME', 'TIMESTAMP'].some(k => t.includes(k))) return 'date'
  if (['BOOL', 'BOOLEAN'].some(k => t.includes(k))) return 'boolean'
  return 'text'
}

export function escapeSqlString(input: string): string {
  return input.replace(/'/g, "''")
}

export function toSqlLiteral(input: unknown): string {
  if (input === null || input === undefined) return 'NULL'
  if (typeof input === 'number') return Number.isFinite(input) ? String(input) : 'NULL'
  if (typeof input === 'boolean') return input ? 'TRUE' : 'FALSE'
  return `'${escapeSqlString(String(input))}'`
}

export function toTypedLiteral(input: unknown, columnType: string): string {
  const simpleType = getSimpleType(columnType)
  if (simpleType === 'number') {
    const numeric = typeof input === 'number' ? input : Number(input)
    return Number.isFinite(numeric) ? String(numeric) : 'NULL'
  }
  if (simpleType === 'boolean') {
    if (typeof input === 'boolean') return input ? 'TRUE' : 'FALSE'
    return String(input).toLowerCase() === 'true' ? 'TRUE' : 'FALSE'
  }
  return toSqlLiteral(input)
}

function hasScalarValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

export function validateFilterCondition(rule: FilterCondition): FilterValidationIssue[] {
  if (!rule.enabled) return []

  switch (rule.operator) {
    case 'is_null':
    case 'is_not_null':
      return []
    case 'between': {
      if (!Array.isArray(rule.value) || rule.value.length !== 2) {
        return [{ conditionId: rule.id, code: 'range_required' }]
      }
      const [min, max] = rule.value
      if (!hasScalarValue(min) || !hasScalarValue(max)) {
        return [{ conditionId: rule.id, code: 'range_required' }]
      }
      const st = getSimpleType(rule.columnType)
      if (st === 'number') {
        const minNum = Number(min)
        const maxNum = Number(max)
        if (!Number.isFinite(minNum) || !Number.isFinite(maxNum) || minNum > maxNum) {
          return [{ conditionId: rule.id, code: 'range_invalid' }]
        }
      } else if (st === 'date') {
        const minDate = Date.parse(String(min))
        const maxDate = Date.parse(String(max))
        if (isNaN(minDate) || isNaN(maxDate) || minDate > maxDate) {
          return [{ conditionId: rule.id, code: 'range_invalid' }]
        }
      } else if (String(min) > String(max)) {
        return [{ conditionId: rule.id, code: 'range_invalid' }]
      }
      return []
    }
    case 'in':
    case 'not_in': {
      if (!Array.isArray(rule.value) || rule.value.length === 0) {
        return [{ conditionId: rule.id, code: 'list_required' }]
      }
      const hasValid = rule.value.some(item => hasScalarValue(item))
      return hasValid ? [] : [{ conditionId: rule.id, code: 'list_required' }]
    }
    default:
      return hasScalarValue(rule.value)
        ? []
        : [{ conditionId: rule.id, code: 'value_required' }]
  }
}

export function validateFilterState(state: FilterState): FilterValidationIssue[] {
  return state.conditions.flatMap(validateFilterCondition)
}

export function filterStateToSQL(state: FilterState): string {
  const enabled = state.conditions.filter(c => c.enabled)
  if (enabled.length === 0) return ''

  const parts = enabled.map(filterRuleToSQL).filter(p => p !== '')
  if (parts.length === 0) return ''

  return `WHERE ${parts.join(` ${state.conjunction} `)}`
}

export function filterRuleToSQL(rule: FilterCondition): string {
  if (!rule.enabled) return ''
  const col = `"${rule.columnName}"`
  const val = rule.value

  switch (rule.operator) {
    case 'equals':
      return `${col} = ${toTypedLiteral(val, rule.columnType)}`
    case 'not_equals':
      return `${col} != ${toTypedLiteral(val, rule.columnType)}`
    case 'contains':
      return `${col} ILIKE '%${escapeSqlString(String(val))}%'`
    case 'not_contains':
      return `${col} NOT ILIKE '%${escapeSqlString(String(val))}%'`
    case 'starts_with':
      return `${col} ILIKE '${escapeSqlString(String(val))}%'`
    case 'ends_with':
      return `${col} ILIKE '%${escapeSqlString(String(val))}'`
    case 'gt':
      return `${col} > ${toTypedLiteral(val, rule.columnType)}`
    case 'gte':
      return `${col} >= ${toTypedLiteral(val, rule.columnType)}`
    case 'lt':
      return `${col} < ${toTypedLiteral(val, rule.columnType)}`
    case 'lte':
      return `${col} <= ${toTypedLiteral(val, rule.columnType)}`
    case 'between':
      // Value should be [min, max]
      if (Array.isArray(val) && val.length === 2) {
        return `${col} BETWEEN ${toTypedLiteral(val[0], rule.columnType)} AND ${toTypedLiteral(val[1], rule.columnType)}`
      }
      return ''
    case 'is_null':
      return `${col} IS NULL`
    case 'is_not_null':
      return `${col} IS NOT NULL`
    case 'in':
      if (Array.isArray(val) && val.length > 0) {
        const list = val.map(v => toTypedLiteral(v, rule.columnType)).join(', ')
        return `${col} IN (${list})`
      }
      return ''
    case 'not_in':
      if (Array.isArray(val) && val.length > 0) {
        const list = val.map(v => toTypedLiteral(v, rule.columnType)).join(', ')
        return `${col} NOT IN (${list})`
      }
      return ''
    default:
      return ''
  }
}
