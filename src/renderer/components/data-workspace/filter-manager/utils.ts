import { FilterOperator, getSimpleType, OPERATOR_CONFIG } from '@shared/types/filter'
import { EffectiveInputType } from './ValueInput'

export function getEffectiveInputType(operator: FilterOperator, simpleType: ReturnType<typeof getSimpleType>): EffectiveInputType {
  if (simpleType === 'date') {
    if (operator === 'between') return 'date_range'
    if (operator === 'in' || operator === 'not_in') return 'multi'
    
    const dateOps: FilterOperator[] = ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte']
    if (dateOps.includes(operator)) return 'date'
  }
  return OPERATOR_CONFIG[operator].inputType as EffectiveInputType
}
