import Store from 'electron-store'
import path from 'path'
import fs from 'fs-extra'
import { v4 as uuidv4 } from 'uuid'
import { TokenBudgetConfig, TokenAuditLog, TokenTransaction } from '../../shared/types/token-audit'

// Schema for Global Token Settings
interface StoreType {
  dailyUsageUSD: number
  dailyInputTokens: number
  dailyOutputTokens: number
  totalUsageUSD: number
  totalInputTokens: number
  totalOutputTokens: number
  lastResetDate: string
  budgetConfig: TokenBudgetConfig
}

const storeSchema = {
  dailyUsageUSD: { type: 'number', default: 0 },
  dailyInputTokens: { type: 'number', default: 0 },
  dailyOutputTokens: { type: 'number', default: 0 },
  totalUsageUSD: { type: 'number', default: 0 },
  totalInputTokens: { type: 'number', default: 0 },
  totalOutputTokens: { type: 'number', default: 0 },
  lastResetDate: { type: 'string', default: '' }, // YYYY-MM-DD
  budgetConfig: {
    type: 'object',
    properties: {
      isEnabled: { type: 'boolean', default: true },
      dailyHardLimitUSD: { type: 'number', default: 5.0 },
      projectSoftLimitUSD: { type: 'number', default: 1.0 },
      basePricePer1M: { type: 'number', default: 1.0 }, // Standard $1 per 1M tokens
      priceMultiplier: { type: 'number', default: 1.0 }  // User adjustable
    },
    default: {
      isEnabled: true,
      dailyHardLimitUSD: 5.0,
      projectSoftLimitUSD: 1.0,
      basePricePer1M: 1.0,
      priceMultiplier: 1.0
    }
  }
} as const

export class TokenManager {
  private store: Store<StoreType>
  
  constructor() {
    this.store = new Store<StoreType>({
      name: 'wansan-token-audit',
      schema: storeSchema as unknown as ConstructorParameters<typeof Store<StoreType>>[0]['schema']
    })
    this.checkDailyReset()
  }

  private checkDailyReset() {
    // Use local date instead of UTC to avoid timezone shifts
    const today = new Date().toLocaleDateString('sv-SE') // Returns YYYY-MM-DD in local time
    const lastDate = this.store.get('lastResetDate') as string
    
    if (lastDate !== today) {
      this.store.set('dailyUsageUSD', 0)
      this.store.set('dailyInputTokens', 0)
      this.store.set('dailyOutputTokens', 0)
      this.store.set('lastResetDate', today)
    }
  }

  public getBudgetConfig(): TokenBudgetConfig {
    return this.store.get('budgetConfig') as TokenBudgetConfig
  }

  public setBudgetConfig(config: Partial<TokenBudgetConfig>) {
    const current = this.getBudgetConfig()
    this.store.set('budgetConfig', { ...current, ...config })
  }

  public getDailyUsage(): number {
    this.checkDailyReset()
    return this.store.get('dailyUsageUSD') as number
  }

  public getTotalUsage(): { usd: number, input: number, output: number } {
    return {
      usd: this.store.get('totalUsageUSD') as number,
      input: this.store.get('totalInputTokens') as number,
      output: this.store.get('totalOutputTokens') as number
    }
  }

  public getDailyTokens(): { input: number, output: number } {
    this.checkDailyReset()
    return {
      input: this.store.get('dailyInputTokens') as number,
      output: this.store.get('dailyOutputTokens') as number
    }
  }

  /**
   * Pre-flight Check: Can we afford this operation?
   * @returns { allowed: boolean, reason?: string }
   */
  public checkBudget(estimatedCostUSD: number): { allowed: boolean, reason?: string } {
    this.checkDailyReset()
    const config = this.getBudgetConfig()
    
    // Bypass if disabled
    if (config.isEnabled === false) return { allowed: true }

    const dailyUsage = this.getDailyUsage()
    
    if (dailyUsage + estimatedCostUSD > config.dailyHardLimitUSD) {
      return { 
        allowed: false, 
        reason: `Daily limit exceeded. Current: $${dailyUsage.toFixed(4)}, Attempt: $${estimatedCostUSD.toFixed(4)}, Limit: $${config.dailyHardLimitUSD}`
      }
    }
    
    return { allowed: true }
  }

  /**
   * Calculate cost based on global base price and multiplier.
   * Logic: (Total Tokens / 1M) * BasePrice * Multiplier
   */
  public calculateCost(_model: string, inputTokens: number, outputTokens: number): number {
    const config = this.getBudgetConfig()
    const totalTokens = inputTokens + outputTokens
    const basePrice = config.basePricePer1M ?? 1.0
    const multiplier = config.priceMultiplier ?? 1.0
    
    return (totalTokens / 1_000_000) * basePrice * multiplier
  }

  /**
   * Commit a transaction: Update global usage AND write to project audit log
   */
  public async logTransaction(
    projectPath: string | null,
    transaction: Omit<TokenTransaction, 'id' | 'timestamp' | 'cost'> & { 
      inputTokens: number, 
      outputTokens: number 
    }
  ): Promise<TokenTransaction> {
    const costUSD = this.calculateCost(transaction.model, transaction.inputTokens, transaction.outputTokens)
    
    // 1. Update Global Stats
    this.checkDailyReset()
    const currentDaily = this.getDailyUsage()
    const currentInput = this.store.get('dailyInputTokens') as number
    const currentOutput = this.store.get('dailyOutputTokens') as number

    this.store.set('dailyUsageUSD', currentDaily + costUSD)
    this.store.set('dailyInputTokens', currentInput + transaction.inputTokens)
    this.store.set('dailyOutputTokens', currentOutput + transaction.outputTokens)

    // Update Global Totals
    const currentTotalUSD = this.store.get('totalUsageUSD') as number
    const currentTotalInput = this.store.get('totalInputTokens') as number
    const currentTotalOutput = this.store.get('totalOutputTokens') as number

    this.store.set('totalUsageUSD', currentTotalUSD + costUSD)
    this.store.set('totalInputTokens', currentTotalInput + transaction.inputTokens)
    this.store.set('totalOutputTokens', currentTotalOutput + transaction.outputTokens)

    // 2. Construct Record
    const record: TokenTransaction = {
      id: uuidv4(),
      timestamp: Date.now(),
      action: transaction.action,
      model: transaction.model,
      snapshot: transaction.snapshot,
      cost: {
        input_tokens: transaction.inputTokens,
        output_tokens: transaction.outputTokens,
        total_usd: costUSD,
        currency: 'USD'
      }
    }

    // 3. Write to Project Log (if project context exists)
    if (projectPath) {
      try {
        const auditPath = path.join(projectPath, '.wansan', 'audit.json')
        // Ensure .wansan dir exists (it should, but safety first)
        await fs.ensureDir(path.dirname(auditPath))
        
        let log: TokenAuditLog = { version: 1, transactions: [] }
        try {
          if (await fs.pathExists(auditPath)) {
            log = await fs.readJSON(auditPath)
          }
        } catch (e) {
          console.warn('[TokenManager] Failed to read audit log, starting fresh', e)
        }

        log.transactions.push(record)
        
        // Write back
        await fs.writeJSON(auditPath, log, { spaces: 2 })
      } catch (e) {
        console.error('[TokenManager] Failed to write project audit log', e)
        // We do NOT throw here, because the global charge succeeded. 
        // Failing to write local log shouldn't crash the app logic, but it is serious.
      }
    }

    return record
  }
}

export const tokenManager = new TokenManager()