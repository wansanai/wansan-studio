export interface TokenCost {
  input_tokens: number
  output_tokens: number
  total_usd: number
  currency?: string // 'USD' | 'CNY'
}

export type TokenActionType = 
  | 'data_analysis' 
  | 'batch_extract' 
  | 'auto_clean' 
  | 'sql_fix' 
  | 'insight_gen'
  | 'metric_gen'
  | 'context_analysis'
  | 'semantic_analyze'

export interface TokenTransaction {
  id: string // UUID
  timestamp: number
  action: TokenActionType
  model: string // e.g. 'gpt-4o'
  cost: TokenCost
  snapshot: {
    table?: string
    column?: string
    row_count?: number
    prompt_preview?: string // First 100 chars
  }
}

export interface TokenAuditLog {
  version: 1
  transactions: TokenTransaction[]
}

// Global Pricing Config (User configurable)
export interface ModelPricingConfig {
  modelId: string
  inputPricePer1M: number // in USD
  outputPricePer1M: number // in USD
}

export interface TokenBudgetConfig {
  isEnabled: boolean // Master toggle for budget protection
  dailyHardLimitUSD: number // Global limit
  projectSoftLimitUSD: number // Project-level warning threshold
  basePricePer1M: number // Base price per 1M tokens (Default: $1.0)
  priceMultiplier: number // User-defined multiplier (Default: 1.0)
}
