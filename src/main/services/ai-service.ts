import Store from 'electron-store'
import { OpenAI } from 'openai'
import type { ClientOptions } from 'openai'
import {
  generateAnalysis,
  analyzeContext,
  fixSQL,
  generateComponent,
} from '../engine/ai-bridge'
import crypto from 'crypto'
import { secureGet, secureSet } from './secure-storage'
import type {
  TableSchema,
  AIAnalysisResult,
  RelationSuggestion,
  ContextAnalysisResult,
  AIConfig,
  DomainRule,
} from '@shared/types.ts'
import type { GenUIResponse } from '@shared/gen-ui-types'

// --- Security Config (Must match obfuscate-tool.js) ---
const MASTER_SALT = 'wansan-studio-2025-special-security-salt'

function decryptBuiltinKey(obfuscated: string): string {
  try {
    const parts = obfuscated.split(':')
    if (parts.length !== 3) return '' // Invalid format
    const [ivBase64, authTagBase64, encryptedBase64] = parts
    const iv = Buffer.from(ivBase64, 'base64')
    const authTag = Buffer.from(authTagBase64, 'base64')
    // Derive same key
    const key = crypto.pbkdf2Sync(
      MASTER_SALT,
      'salt-pepper',
      100000,
      32,
      'sha256'
    )
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (e) {
    console.error('[AI Service] Decryption failed:', e)
    return ''
  }
}

// Define schema for electron-store (Exclude apiKey from file storage)
const schema = {
  aiConfig: {
    type: 'object',
    properties: {
      baseURL: { type: 'string' },
      model: { type: 'string' },
    },
    default: {},
  },
} as const

const store = new Store({
  schema,
  name: 'wansan-ai-config', // 独立文件 wansan-ai-config.json
  encryptionKey: 'wansan-studio-secure-config-key',
})

export class AIService {
  private openai: OpenAI | null = null
  private model = 'gpt-4-turbo-preview'
  // Internal cache for sensitive builtin config
  private builtinConfig: AIConfig | null = null

  constructor() {
    this.initBuiltinConfig()
    this.loadConfig()
  }

  private initBuiltinConfig() {
    try {
      const baseUrl = process.env.VITE_BUILTIN_BASE_URL
      const rawKey = process.env.VITE_BUILTIN_API_KEY
      const models = process.env.VITE_BUILTIN_MODELS

      if (rawKey) {
        // 1. Try decrypting with AES-GCM (for production/CI)
        let apiKey = decryptBuiltinKey(rawKey)
        // 2. Fallback: If decryption fails (returns empty string), try Base64 (for simpler dev setups)
        if (!apiKey && !rawKey.includes(':')) {
          try {
            const decoded = Buffer.from(rawKey, 'base64').toString('utf-8')
            if (/^[a-zA-Z0-9_\-.]+$/.test(decoded)) {
              apiKey = decoded
            }
          } catch {
            /* ignore */
          }
        }
        // 3. Fallback: Use raw key if all else fails
        if (!apiKey) {
          apiKey = rawKey
        }
        this.builtinConfig = {
          apiKey,
          baseURL: baseUrl || '',
          model: models?.split(',')[0] || 'gpt-4-turbo-preview',
          models: models?.split(',') || [],
          provider: 'custom',
          isManaged: true,
        }
        console.log(`[AI Service] Managed config loaded.`)
      }
    } catch (e) {
      console.error('[AI Service] Failed to parse builtin config:', e)
    }
  }

  private loadConfig() {
    const storedConfig = (store.get('aiConfig') as AIConfig) || {}
    // Determine priority: Builtin (Managed) > Stored > Runtime Env > Default
    let effectiveConfig: AIConfig = {}
    if (this.builtinConfig) {
      effectiveConfig = { ...this.builtinConfig }
      // Allow overriding model from store if it exists
      if (storedConfig.model) {
        effectiveConfig.model = storedConfig.model
      }
    } else {
      // Securely retrieve API Key from system keychain
      const secureKey = secureGet('apiKey') || ''
      effectiveConfig = {
        apiKey: secureKey || process.env.OPENAI_API_KEY,
        baseURL: storedConfig.baseURL || process.env.OPENAI_BASE_URL,
        model:
          storedConfig.model ||
          process.env.OPENAI_MODEL ||
          'gpt-4-turbo-preview',
      }
    }
    this.model = effectiveConfig.model || 'gpt-4-turbo-preview'
    if (effectiveConfig.apiKey) {
      const options: ClientOptions = {
        apiKey: effectiveConfig.apiKey,
        baseURL: effectiveConfig.baseURL,
      }
      this.openai = new OpenAI(options)
    } else {
      this.openai = null
      console.warn('AI Service: Not configured (missing API Key).')
    }
  }

  private requireOpenAI(): OpenAI {
    if (!this.openai) {
      throw new Error('AI not configured')
    }
    return this.openai
  }

  async verifyConnection(config?: AIConfig): Promise<boolean> {
    let client: OpenAI
    if (config && config.apiKey) {
      // Use temporary client for verification if config provided
      client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      })
    } else {
      client = this.requireOpenAI()
    }
    try {
      const response = await client.models.list()
      console.log(
        '[AI Service] Connection verified. Available models:',
        response.data.map(model => model.id).join(', ')
      )
      return true
    } catch (e) {
      console.error('[AI Service] Connection verification failed:', e)
      throw e
    }
  }

  async generatePlan(
    userQuery: string,
    schemas: TableSchema[],
    relations: RelationSuggestion[],
    context?: { lastSql: string; lastQuery: string },
    language: 'en' | 'zh' = 'en',
    domainRules: DomainRule[] = []
  ): Promise<AIAnalysisResult> {
    const client = this.requireOpenAI()
    const aiResult = await generateAnalysis(
      client,
      userQuery,
      schemas,
      relations,
      context,
      this.model,
      language,
      domainRules
    )
    return {
      status: 'success',
      ...aiResult,
    }
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const client = this.requireOpenAI()
    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt || 'You are a helpful assistant.',
        },
        { role: 'user', content: prompt },
      ],
    })
    return response.choices[0].message.content || ''
  }

  async fixQuery(
    originalSql: string,
    error: string,
    schemas: TableSchema[],
    domainRules: DomainRule[] = []
  ): Promise<{ sql: string; reasoning: string }> {
    const client = this.requireOpenAI()
    return await fixSQL(
      client,
      originalSql,
      error,
      schemas,
      this.model,
      domainRules
    )
  }

  async getContextAnalysis(
    schemas: TableSchema[],
    language: 'en' | 'zh' = 'en'
  ): Promise<ContextAnalysisResult> {
    const client = this.requireOpenAI()
    return await analyzeContext(client, schemas, this.model, language)
  }

  setConfig(config: AIConfig) {
    const current = (store.get('aiConfig') as AIConfig) || {}
    const { apiKey, ...otherConfig } = config

    if (this.builtinConfig) {
      // In managed mode, only allow updating the model
      const { model } = otherConfig
      if (model) {
        store.set('aiConfig', { ...current, model })
        this.loadConfig()
      }
      return
    }

    // 1. Save Key to Secure Storage
    if (apiKey !== undefined) {
      secureSet('apiKey', apiKey)
    }
    // 2. Save other config to Electron Store
    const newConfig = { ...current, ...otherConfig }
    store.set('aiConfig', newConfig)
    this.loadConfig()
  }

  getConfig(): AIConfig {
    if (this.builtinConfig) {
      return {
        ...this.builtinConfig,
        model: this.model, // Ensure we return the active model
        apiKey: '********************',
      }
    }
    const storedConfig = (store.get('aiConfig') as AIConfig) || {}
    const secureKey = secureGet('apiKey') || ''
    return {
      apiKey: secureKey,
      baseURL: storedConfig.baseURL || '',
      model: storedConfig.model || 'gpt-4-turbo-preview',
    }
  }

  getManagedConfig() {
    if (!this.builtinConfig) return null
    return {
      provider: this.builtinConfig.provider || 'custom',
      models: this.builtinConfig.models || [],
    }
  }

  hasApiKey(): boolean {
    return !!this.openai
  }

  async generateMetricExpression(options: {
    input: string
    columns: { name: string; type: string }[]
    mode: 'generate' | 'refine'
  }): Promise<string> {
    const { input, columns, mode } = options
    const client = this.requireOpenAI()
    const columnList = columns.map(c => `- ${c.name} (${c.type})`).join('\n')
    const quotingRule = `
CRITICAL SYNTAX RULES:
1. **ALWAYS** wrap column names in DOUBLE QUOTES ( ").
2. For SQLite/DuckDB compatibility, use standard SQL operators.
`

    const systemPrompt = `You are a DuckDB expert. Convert user natural language into a valid SQL expression fragment for a SELECT clause.
    Available columns in the current context:
    ${columnList}
    
    ${quotingRule}
    
    Return ONLY the SQL expression, no commentary, no 'SELECT', no 'AS'.`

    const userPrompt =
      mode === 'generate'
        ? `Create an expression for: ${input}`
        : `Refine this expression: ${input}`

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
    })

    return response.choices[0].message.content?.trim() || ''
  }

  async generateComponent(
    userQuery: string,
    dataSample: any[]
  ): Promise<GenUIResponse> {
    const client = this.requireOpenAI()
    return await generateComponent(client, userQuery, dataSample, this.model)
  }

  clearConfig() {
    if (this.builtinConfig) return
    store.clear()
    secureSet('apiKey', '')
    this.loadConfig()
  }
}
