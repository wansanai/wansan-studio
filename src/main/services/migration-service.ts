import { NativeDatabaseService } from './native-db-service'

export class MigrationService {
  constructor(private db: NativeDatabaseService) {}

  /**
   * Migrate all tables in the current database to V1.7 standard (with _ws_row_id).
   */
  async upgradeToV17() {
    console.log('[Migration] Checking for V1.7 schema updates...')
    
    try {
      // 1. Get all base tables
      const tablesRes = await this.db.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'BASE TABLE'"
      )
      const tables = tablesRes.map((r: any) => r.table_name)

      for (const tableName of tables) {
        // Skip sidecar tables
        if (tableName.endsWith('_ext_ai')) continue

        // 2. Check if _ws_row_id exists
        const colsRes = await this.db.query(`PRAGMA table_info('${tableName}')`)
        const hasId = colsRes.some((c: any) => c.name === '_ws_row_id')

        if (!hasId) {
          await this.migrateTable(tableName)
        }
      }
      
      console.log('[Migration] Schema check completed.')
    } catch (error) {
      console.error('[Migration] Critical failure during upgrade:', error)
      throw error
    }
  }

  private async migrateTable(tableName: string) {
    console.log(`[Migration] Upgrading table "${tableName}" to V1.7...`)
    
    const seqName = `seq_${tableName}`
    const tempName = `${tableName}_migration_${Date.now()}`

    try {
      // 1. Create Sequence
      await this.db.exec(`CREATE SEQUENCE IF NOT EXISTS "${seqName}" START 1`)

      // 2. Rebuild Table with IDs (Materialize physical row numbers)
      // Note: We use row_number() here to get a deterministic 1,2,3... order for legacy data.
      await this.db.exec(`
        CREATE TABLE "${tempName}" AS 
        SELECT 
          CAST(row_number() OVER () AS BIGINT) AS _ws_row_id,
          * 
        FROM "${tableName}"
      `)

      // 3. Sync Sequence High-Water Mark (DuckDB Workaround: Recreate Sequence)
      const maxIdRes = await this.db.query(`SELECT MAX(_ws_row_id) as max_id FROM "${tempName}"`)
      const maxId = Number(maxIdRes[0]?.max_id || 0)
      
      await this.db.exec(`DROP SEQUENCE IF EXISTS "${seqName}"`)
      await this.db.exec(`CREATE SEQUENCE "${seqName}" START ${maxId + 1}`)

      // 4. Atomic Swap
      await this.db.exec(`DROP TABLE "${tableName}"`)
      await this.db.exec(`ALTER TABLE "${tempName}" RENAME TO "${tableName}"`)

      console.log(`[Migration] Table "${tableName}" upgraded successfully. Max ID: ${maxId}`)
    } catch (error) {
      console.error(`[Migration] Failed to migrate table "${tableName}":`, error)
      // Attempt cleanup temp table if exists
      await this.db.exec(`DROP TABLE IF EXISTS "${tempName}"`).catch(() => {})
      throw error
    }
  }
}
