import { NativeDatabaseService } from './native-db-service'
import { AIService } from './ai-service'
import { FileService } from './file'
import { BrowserWindow } from 'electron'
import { CHARS_PER_TOKEN_EN, CHARS_PER_TOKEN_ZH } from '../engine/ai-utils'
import { tokenManager } from './token-manager'
import { getSidecarTableName } from '@shared/naming-utils'

export interface BatchJobParams {
  tableName: string
  columnName: string
  targetColumnName: string
  prompt: string
  projectPath: string | null
  window?: BrowserWindow
}

interface TableInfo {
  column_name: string
  column_type: string
  null: string
  key: string
  default: unknown
  extra: unknown
}

export class BatchProcessor {
  constructor(
    private db: NativeDatabaseService,
    private ai: AIService,
    private fileService: FileService
  ) {}

  /**
   * Estimates the cost of a batch extraction job.
   */
  async estimateCost(params: Omit<BatchJobParams, 'window'>): Promise<{
    totalRows: number
    estimatedInputTokens: number
    estimatedOutputTokens: number
    estimatedCostUSD: number
  }> {
    const { tableName, columnName, targetColumnName, prompt } = params
    const sidecarName = getSidecarTableName(tableName)

    // 1. Get total count of rows needing processing
    let total = 0
    try {
      const countRes = await this.db.query(`
        SELECT COUNT(*) as count 
        FROM "${tableName}" t1
        LEFT JOIN (
          SELECT * FROM information_schema.tables WHERE table_name = '${sidecarName}'
        ) as s_exists ON 1=1
        LEFT JOIN "${sidecarName}" t2 ON t1._ws_row_id = t2._ws_row_id
        WHERE t2."${targetColumnName}" IS NULL OR t2._ws_row_id IS NULL
      `) as { count: number | bigint }[]
      total = Number(countRes[0].count)
    } catch {
      // Fallback: if sidecar doesn't exist yet, just count the main table
      const countRes = await this.db.query(`SELECT COUNT(*) as count FROM "${tableName}"`) as { count: number | bigint }[]
      total = Number(countRes[0].count)
    }

    if (total === 0) {
      return { totalRows: 0, estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUSD: 0 }
    }

    // 2. Token Estimation Logic
    // Prompt context (system + user overhead)
    const promptChars = prompt.length + 200 // Add some overhead for system prompt
    const avgCharsPerToken = prompt.match(/[\u4e00-\u9fa5]/) ? CHARS_PER_TOKEN_ZH : CHARS_PER_TOKEN_EN

    // Sample a few rows to get average character length of the source column
    const samples = await this.db.query(`SELECT "${columnName}" as val FROM "${tableName}" LIMIT 10`) as { val: unknown }[]
    const avgValLen = samples.reduce((acc, s) => acc + String(s.val || '').length, 0) / (samples.length || 1)

    const inputTokensPerRow = (promptChars + avgValLen) / avgCharsPerToken
    const outputTokensPerRow = 50 / avgCharsPerToken // Assume 50 chars avg for extracted text

    const estimatedInputTokens = Math.ceil(inputTokensPerRow * total)
    const estimatedOutputTokens = Math.ceil(outputTokensPerRow * total)

    const estimatedCostUSD = tokenManager.calculateCost(
      this.ai.getConfig().model,
      estimatedInputTokens,
      estimatedOutputTokens
    )

    return {
      totalRows: total,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUSD
    }
  }

  async runExtraction(params: BatchJobParams) {
    const { tableName, columnName, targetColumnName, prompt, projectPath, window } = params
    const sidecarName = getSidecarTableName(tableName)
    const batchSize = 20 // Smaller batches for better interactivity

    try {
      // 1. Ensure Sidecar Table exists
      await this.db.exec(`CREATE TABLE IF NOT EXISTS "${sidecarName}" (_ws_row_id BIGINT PRIMARY KEY)`)

      // 2. Add Target Column to Sidecar if not exists
      const colsResult = await this.db.query(`PRAGMA table_info('${sidecarName}')`)
      const cols = colsResult.map(c => ({
        column_name: c.name as string,
        column_type: c.type as string,
        null: c.notnull === 0 ? 'YES' : 'NO',
        key: c.pk === 1 ? 'PRI' : '',
        default: c.dflt_value,
        extra: ''
      })) as unknown as TableInfo[]
      if (!cols.some(c => c.column_name === targetColumnName)) {
        await this.db.exec(`ALTER TABLE "${sidecarName}" ADD COLUMN "${targetColumnName}" TEXT`)
      }

      // 3. Get total count of rows needing processing
      const countRes = await this.db.query(`
        SELECT COUNT(*) as count 
        FROM "${tableName}" t1
        LEFT JOIN "${sidecarName}" t2 ON t1._ws_row_id = t2._ws_row_id
        WHERE t2."${targetColumnName}" IS NULL
      `) as { count: number | bigint }[]

      const total = Number(countRes[0].count)
      let processed = 0

      console.log(`[BatchProcessor] Starting job: ${total} rows to process for ${tableName}.${columnName}`)

      // 4. Batch Loop
      while (processed < total) {
        // Fetch next chunk
        const rows = await this.db.query(`
          SELECT t1._ws_row_id, t1."${columnName}" as val
          FROM "${tableName}" t1
          LEFT JOIN "${sidecarName}" t2 ON t1._ws_row_id = t2._ws_row_id
          WHERE t2."${targetColumnName}" IS NULL
          LIMIT ${batchSize}
        `) as { _ws_row_id: number | bigint, val: unknown }[]

        if (rows.length === 0) break

        const ids = rows.map(r => r._ws_row_id)
        const vals = rows.map(r => r.val)

        // Call AI
        const aiRes = await this.ai.previewExtraction(vals, prompt, projectPath)

        // Write results to sidecar
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i]
          const result = aiRes.results[i] ?? null

          // Use UPSERT logic
          await this.db.exec(`
            INSERT INTO "${sidecarName}" (_ws_row_id, "${targetColumnName}") 
            VALUES (${id}, ${result === null ? 'NULL' : `'${String(result).replace(/'/g, "''")}'`})
            ON CONFLICT(_ws_row_id) DO UPDATE SET "${targetColumnName}" = EXCLUDED."${targetColumnName}"
          `)
        }

      processed += rows.length

        // Send Progress to UI
        if (window) {
          window.webContents.send('ai:batch-progress', {
            tableName,
            columnName,
            targetColumnName,
            total,
            processed,
            percentage: Math.round((processed / total) * 100)
          })
        }
      }

      // [V1.7.5] Send Completion Signal
      if (window) {
        window.webContents.send('ai:batch-complete', {
          tableName,
          columnName,
          targetColumnName,
        })
      }

      console.log(`[BatchProcessor] Job completed for ${tableName}`)

    } catch (error) {
      console.error(`[BatchProcessor] Job failed`, error)
      throw error
    }
  }
}
