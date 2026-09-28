import fs from 'fs-extra'
import { basename, extname } from 'path'
import readline from 'readline'
import { NativeDatabaseService } from './native-db-service'
import { TempFileManager } from '../utils/temp-manager'
import {
  getSampleValues,
  ingestExcelFile,
  ingestJsonData,
} from '../engine/ingestion'
import { DEMO_DATA } from '@shared/demo-data.ts'
import { ColumnSchema, ColumnType, ReloadResult } from '@shared/types.ts'
import { normalizeDuckDBType } from '@shared/type-utils.ts'
import {
  AppendDataParams,
  CreateTableParams,
  IngestPreCheckParams,
  IngestPreCheckResponse,
  ValidateColumnTypesParams,
} from '@shared/electron-api.ts'

type FileProgressInfo = {
  rowCount?: number
  isPercentage?: boolean
  progress?: number
}

type TableInfoRow = Record<string, unknown>

type TableNameRow = {
  table_name: string
}

export class FileService {
  constructor(private databaseService: NativeDatabaseService) {}

  // [Stage 1] Ultra-Lightweight Inspection: Task Generation ONLY
  async inspectFile(filePath: string): Promise<
    Array<{
      sourceName: string
    }>
  > {
    const ext = extname(filePath).toLowerCase()

    // Branch A: Excel (XLSX/XLS) -> Use Worker to expand sheets
    if (ext === '.xlsx' || ext === '.xls') {
      return await ingestExcelFile(
        filePath,
        this.databaseService,
        basename(filePath),
        undefined,
        undefined,
        undefined,
        't_',
        undefined,
        undefined,
        'inspect'
      )
    }

    // Branch B: Flat Files (CSV, JSON, Parquet) -> Identity
    if (['.csv', '.json', '.parquet'].includes(ext)) {
      return [{ sourceName: basename(filePath) }]
    }

    throw new Error(`Unsupported file type: ${ext}`)
  }

  // [Stage 2] Staging: Data Loading, Encoding Detection, Temp Table Creation
  async prepareFile(
    filePath: string,
    sourceName: string,
    _readOptions?: Record<string, unknown>
  ): Promise<{
    tempFilePath: string
    rowCount: number
    columns: ColumnSchema[]
    preview: Record<string, unknown>[]
    readOptions?: Record<string, unknown>
  }> {
    const ext = extname(filePath).toLowerCase()
    const fileName = basename(filePath)
    const safePath = filePath.replace(/\\/g, '/')

    // Branch A: Excel -> Convert to CSV via Worker
    if (ext === '.xlsx' || ext === '.xls') {
      const schemas = await ingestExcelFile(
        filePath,
        this.databaseService,
        fileName,
        undefined,
        sourceName,
        undefined,
        'temp_stage_'
      )
      if (schemas.length === 0) throw new Error(`Sheet ${sourceName} not found`)
      const schema = schemas[0]
      const preview = await this.databaseService.query(
        `SELECT * FROM "${schema.tableName}" LIMIT 100`
      )
      const countRes = await this.databaseService.query(
        `SELECT COUNT(*) as count FROM "${schema.tableName}" `
      )
      return {
        tempFilePath: schema.tempFilePath || '',
        rowCount: Number(countRes[0].count),
        columns: schema.columns,
        preview,
        readOptions: undefined,
      }
    }

    // Branch B: Flat Files -> DuckDB Direct Read + Encoding Detection
    let reader = 'read_csv_auto'
    let detectedOptions: Record<string, unknown> | undefined = undefined
    let activePath = safePath // Path to be used for reading (might be cleaned temp file)

    if (ext === '.json') {
      reader = 'read_json_auto'
      const opts = "format='auto', auto_detect=true"
      try {
        await this.databaseService.query(
          `DESCRIBE SELECT * FROM ${reader}('${activePath}', ${opts})`
        )
        detectedOptions = { format: 'auto', auto_detect: true }
      } catch {
        throw new Error('Invalid JSON file')
      }
    } else if (ext === '.parquet') {
      reader = 'read_parquet'
    } else if (ext === '.csv') {
      try {
        detectedOptions = await this.detectCsvEncoding(activePath)
      } catch (e) {
        // [V1.7] Heuristic Fallback: Try to clean the file (remove thousands separators)
        console.warn('Standard CSV detection failed. Attempting heuristic cleaning...', e)
        const cleanedPath = await this.applyHeuristicCleaning(filePath)
        if (cleanedPath) {
          try {
             const cleanedSafePath = cleanedPath.replace(/\\/g, '/')
             detectedOptions = await this.detectCsvEncoding(cleanedSafePath)
             activePath = cleanedSafePath // Use the cleaned file for subsequent queries
             console.log('Heuristic cleaning successful using file:', activePath)
          } catch (cleanErr) {
             throw new Error(`Failed to parse CSV even after heuristic cleaning: ${cleanErr.message}`)
          }
        } else {
           throw e // Rethrow original error if heuristic didn't apply or fail
        }
      }
    }

    // Final Read
    let optionsStr = ''
    if (detectedOptions) {
      optionsStr =
        ', ' +
        Object.entries(detectedOptions)
          .map(([k, v]) => `${k}=${typeof v === 'string' ? `'${v}'` : v}`)
          .join(', ')
    } else if (reader === 'read_json_auto') {
      optionsStr = ", format='auto', auto_detect=true"
    } else if (reader === 'read_csv_auto') {
      optionsStr = ', auto_detect=true'
    }

    const readSql = `${reader}('${activePath}'${optionsStr})`

    const preview = await this.databaseService.query(
      `SELECT * FROM ${readSql} LIMIT 100`
    )
    const columnsResult = await this.databaseService.query(
      `DESCRIBE SELECT * FROM ${readSql}`
    )
    const countResult = await this.databaseService.query(
      `SELECT COUNT(*) as count FROM ${readSql}`
    )

    const columns: ColumnSchema[] = columnsResult.map((col: Record<string, unknown>) => ({
      name: col.column_name as string,
      safeName: col.column_name as string,
      type: normalizeDuckDBType(col.column_type as string) as ColumnType,
      sampleValues: [],
    }))

    return {
      tempFilePath: activePath === safePath ? filePath : activePath, // Return the cleaned path if used
      rowCount: Number(countResult[0].count),
      columns,
      preview,
      readOptions: detectedOptions,
    }
  }

  // [V1.7] Heuristic Cleaning for CSVs (Thousands Separator Removal)
  private async applyHeuristicCleaning(filePath: string): Promise<string | null> {
    try {
      const fd = await fs.open(filePath, 'r')
      const buffer = Buffer.alloc(4096)
      const bytesRead = await fs.read(fd, buffer, 0, 4096, 0)
      await fs.close(fd)
      const sample = buffer.toString('utf8', 0, bytesRead.bytesRead)
      
      // Check for digit-comma-digit pattern (e.g. 1,000)
      const hasThousands = /\d{1,3}(,\d{3})+/.test(sample)
      if (!hasThousands) return null
      
      await TempFileManager.ensureTempDir()
      const tempPath = TempFileManager.getTempFilePath('.csv')
      const readStream = fs.createReadStream(filePath, { encoding: 'utf8' })
      const writeStream = fs.createWriteStream(tempPath, { encoding: 'utf8' })
      
      const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity
      })
      
      for await (const line of rl) {
        // Remove commas that are surrounded by digits: 1,234 -> 1234
        const cleaned = line.replace(/(\d),(?=\d{3})/g, '$1')
        writeStream.write(cleaned + '\n')
      }
      
      writeStream.end()
      await new Promise(fulfill => writeStream.on('finish', () => fulfill(undefined)))
      return tempPath
    } catch (e) {
      console.warn('Heuristic cleaning failed:', e)
      return null
    }
  }

  // Legacy parseFile (keep for safety)
  async parseFile(filePath: string, _onProgress?: (info: FileProgressInfo) => void) {
    const res = await this.prepareFile(filePath, basename(filePath))
    return [
      {
        tableName: '',
        schema: {
          tableName: '',
          description: basename(filePath),
          columns: res.columns,
        },
        rowCount: res.rowCount,
        preview: res.preview,
      },
    ]
  }

  async validateColumnTypes(
    params: ValidateColumnTypesParams
  ): Promise<{
    valid: boolean
    error?: string
    errorDetail?: { column: string; value: string; type: string }
  }> {
    const { filePath, tempFilePath, sourceTableName, columns, readOptions } =
      params
    let readSql = ''
    if (sourceTableName) readSql = `"${sourceTableName}"`
    else {
      const targetPath =
        tempFilePath && fs.existsSync(tempFilePath) ? tempFilePath : filePath
      const ext = extname(targetPath).toLowerCase()
      const safePath = targetPath.replace(/\\/g, '/')
      const extraOptions = readOptions
        ? ', ' +
          Object.entries(readOptions)
            .map(([k, v]) => `${k}=${typeof v === 'string' ? `'${v}'` : v}`)
            .join(', ')
        : ''
      if (ext === '.csv')
        readSql = `read_csv_auto('${safePath}', auto_detect=true${extraOptions})`
      else if (ext === '.json')
        readSql = `read_json_auto('${safePath}', format='auto', auto_detect=true)`
      else if (ext === '.parquet') readSql = `read_parquet('${safePath}')`
      else return { valid: false, error: `Unsupported validation for ${ext}` }
    }
    for (const col of columns) {
      try {
        await this.databaseService.query(
          `SELECT CAST("${col.name}" AS ${col.type}) FROM ${readSql} LIMIT 50000`
        )
      } catch (e: unknown) {
        return {
          valid: false,
          error: e instanceof Error ? e.message : String(e),
          errorDetail: { column: col.name, type: col.type, value: '?' },
        }
      }
    }
    return { valid: true }
  }

  async reIngestFile(
    filePath: string,
    tableName: string,
    sheetName?: string,
    _onProgress?: (info: FileProgressInfo) => void,
    knownColumns?: ColumnSchema[],
    readOptions?: Record<string, unknown>
  ): Promise<ReloadResult> {
    if (filePath === 'DEMO_MEMORY') {
      const result = await ingestJsonData(
        this.databaseService,
        tableName,
        DEMO_DATA
      )
      return { lastModified: Date.now(), newColumns: result.columns }
    }
    const ext = extname(filePath).toLowerCase()
    const stats = await fs.stat(filePath)

    // [FIX] DuckDB uses 'types' for CSV but 'columns' for JSON
    const paramName = ext === '.json' ? 'columns' : 'types'
    const typesParam = knownColumns
      ? `${paramName}={${knownColumns.map(c => `'${c.name}': '${c.type}'`).join(', ')}}`
      : ''

    if (ext === '.xlsx' || ext === '.xls') {
      // For Excel, we currently rely on the worker. The worker creates the table directly.
      // Ideally, the worker should also support sequence generation or we wrap it here.
      // However, ingestExcelFile logic is complex.
      // Strategy: Let ingestExcelFile create the table (e.g. "t_123"), then we restructure it.
      // Or we modify ingestExcelFile.
      // Given ingestExcelFile is in another file, let's look at `createTableFromSource` which is generic.
      // But reIngestFile calls ingestExcelFile directly.
      // To ensure consistency, we should reconstruct the table here after ingestExcelFile returns.
      
      const _schemas = await ingestExcelFile(
        filePath,
        this.databaseService,
        basename(filePath),
        tableName,
        sheetName,
        _onProgress,
        't_',
        typesParam
      )
      
      // [V1.7] Post-processing: Ensure _ws_row_id exists
      // The worker creates the table `tableName`. We need to add the ID column.
      const seqName = this.getSequenceName(tableName)
      await this.databaseService.exec(`CREATE SEQUENCE IF NOT EXISTS "${seqName}" START 1`)
      
      // Check if _ws_row_id already exists (unlikely unless worker adds it)
      const hasId = await this.databaseService.query(`SELECT 1 FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name = '_ws_row_id'`)
      if (hasId.length === 0) {
        const tempName = `${tableName}_temp_${Date.now()}`
        await this.databaseService.exec(`ALTER TABLE "${tableName}" RENAME TO "${tempName}"`)
        await this.databaseService.exec(`CREATE TABLE "${tableName}" AS SELECT nextval('${seqName}') AS _ws_row_id, * FROM "${tempName}"`)
        await this.databaseService.exec(`DROP TABLE "${tempName}"`)
      }

      const columnsResult = await this.databaseService.query(
        `PRAGMA table_info('${tableName}');`
      )
      // Re-fetch columns to include _ws_row_id
       const finalCols = await Promise.all(
        columnsResult.map(async (col: TableInfoRow) => {
          const type = normalizeDuckDBType(col.type as string)
          return {
            name: col.name as string,
            safeName: col.name as string,
            type: type as ColumnType,
            sampleValues: await getSampleValues(
              this.databaseService,
              tableName,
              col.name as string,
              type as ColumnType
            ),
          }
        })
      )

      return {
        lastModified: stats.mtimeMs,
        newColumns: finalCols,
      }
    } else {
      const seqName = this.getSequenceName(tableName)
      await this.databaseService.exec(`DROP SEQUENCE IF EXISTS "${seqName}"`)
      await this.databaseService.exec(`CREATE SEQUENCE "${seqName}" START 1`)

      await this.databaseService.exec(`DROP TABLE IF EXISTS "${tableName}"`)
      const safePath = filePath.replace(/\\/g, '/')
      const reader =
        ext === '.json'
          ? 'read_json_auto'
          : ext === '.parquet'
            ? 'read_parquet'
            : 'read_csv_auto'
      const extraOptions =
        ext === '.csv' && readOptions
          ? ', ' +
            Object.entries(readOptions)
              .map(([k, v]) => `${k}=${typeof v === 'string' ? `'${v}'` : v}`)
              .join(', ')
          : ''
      const opts =
        ext === '.csv'
          ? `auto_detect=true${extraOptions}`
          : ext === '.json'
            ? "format='auto', auto_detect=true"
            : ''

      const loadSql = `${reader}('${safePath}'${typesParam ? ', ' + typesParam : ''}${opts ? ', ' + opts : ''})`

      await this.databaseService.exec(
        `CREATE TABLE "${tableName}" AS SELECT nextval('${seqName}') AS _ws_row_id, * FROM ${loadSql}`
      )
      
      const columnsResult = await this.databaseService.query(
        `PRAGMA table_info('${tableName}');`
      )
      const finalCols = await Promise.all(
        columnsResult.map(async (col: TableInfoRow) => {
          const type = normalizeDuckDBType(col.type as string)
          return {
            name: col.name as string,
            safeName: col.name as string,
            type: type as ColumnType,
            sampleValues: await getSampleValues(
              this.databaseService,
              tableName,
              col.name as string,
              type as ColumnType
            ),
          }
        })
      )
      return { lastModified: stats.mtimeMs, newColumns: finalCols }
    }
  }

  async createTableFromSource(
    params: CreateTableParams
  ): Promise<{ rowCount: number; columns: ColumnSchema[] }> {
    const {
      filePath,
      tableName,
      sourceTableName,
      columns,
      tempFilePath,
      readOptions,
    } = params
    const ext = extname(filePath).toLowerCase()
    const activeCols = columns.filter(c => !c.isIgnored)
    if (activeCols.length === 0) throw new Error('No columns selected')
    const typesSql = activeCols.map(c => `'${c.name}': '${c.type}'`).join(', ')

    // [FIX] DuckDB uses 'types' for CSV but 'columns' for JSON
    const paramName = ext === '.json' ? 'columns' : 'types'
    const typesParam = `${paramName}={${typesSql}}`

    const limit = params.limitRows ? ` LIMIT ${params.limitRows}` : ''

    // [V1.7] Sequence Management
    const seqName = this.getSequenceName(tableName)
    // Only drop if we are essentially replacing the table (which we are)
    await this.databaseService.exec(`DROP SEQUENCE IF EXISTS "${seqName}"`) 
    await this.databaseService.exec(`CREATE SEQUENCE "${seqName}" START 1`)

    await this.databaseService.exec(`DROP TABLE IF EXISTS "${tableName}" `)
    if (sourceTableName) {
      const casted = activeCols
        .map(c => `CAST("${c.name}" AS ${c.type}) AS "${c.name}"`)
        .join(', ')
      await this.databaseService.exec(
        `CREATE TABLE "${tableName}" AS SELECT nextval('${seqName}') AS _ws_row_id, ${casted} FROM "${sourceTableName}"${limit}`
      )
    } else {
      let reader = 'read_csv_auto'
      if (ext === '.json') reader = 'read_json_auto'
      else if (ext === '.parquet') reader = 'read_parquet'
      const target =
        tempFilePath && (await fs.pathExists(tempFilePath))
          ? tempFilePath
          : filePath
      const safeTarget = target.replace(/\\/g, '/')
      const colList = activeCols.map(c => `"${c.name}"`).join(', ')
      const extraOptions =
        ext === '.csv' && readOptions
          ? ', ' +
            Object.entries(readOptions)
              .map(([k, v]) => `${k}=${typeof v === 'string' ? `'${v}'` : v}`)
              .join(', ')
          : ''
      const loadOptions =
        ext === '.parquet' ? '' : `, ${typesParam}${extraOptions}`
      await this.databaseService.exec(
        `CREATE TABLE "${tableName}" AS SELECT nextval('${seqName}') AS _ws_row_id, ${colList} FROM ${reader}('${safeTarget}'${loadOptions})${limit}`
      )
    }

    const count = await this.databaseService.query(
      `SELECT COUNT(*) as count FROM "${tableName}" `
    )
    const cols = await this.databaseService.query(
      `PRAGMA table_info('${tableName}')`
    )
    const finalCols = await Promise.all(
      cols.map(async (c: TableInfoRow) => {
        const type = normalizeDuckDBType(c.type as string)
        return {
          name: c.name as string,
          safeName: c.name as string,
          type: type as ColumnType,
          sampleValues: await getSampleValues(
            this.databaseService,
            tableName,
            c.name as string,
            type as ColumnType
          ),
        }
      })
    )
    return { rowCount: Number(count[0].count), columns: finalCols }
  }

  async cleanupStaging(tables: string[], files?: string[]) {
    for (const t of tables)
      if (t) await this.databaseService.exec(`DROP TABLE IF EXISTS "${t}" `)
    // 2. Remove files
    if (files) {
      for (const f of files) {
        if (f) {
          await TempFileManager.secureUnlink(f)
        }
      }
    }
  }

  async cleanupAllStaging() {
    const tables = await this.databaseService.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'temp_ingest_%' OR table_name LIKE 'temp_stage_%' `
    )
    for (const t of tables)
      await this.databaseService.exec(
        `DROP TABLE IF EXISTS "${(t as TableNameRow).table_name}" `
      )
    await TempFileManager.cleanupOldFiles()
  }

  async cleanupTempFiles() {
    await TempFileManager.cleanupOldFiles()
  }

  async ingestPreCheck(
    params: IngestPreCheckParams
  ): Promise<IngestPreCheckResponse> {
    const {
      filePath,
      targetTableName,
      sourceTableName,
      uniqueKeys,
      columnMapping,
      tempFilePath,
      readOptions,
    } = params
    const ext = extname(filePath).toLowerCase()
    let sourceSql = ''
    if (sourceTableName) sourceSql = `"${sourceTableName}"`
    else {
      let reader = 'read_csv_auto'
      if (ext === '.json') reader = 'read_json_auto'
      else if (ext === '.parquet') reader = 'read_parquet'
      const target =
        tempFilePath && (await fs.pathExists(tempFilePath))
          ? tempFilePath
          : filePath
      const safeTarget = target.replace(/\\/g, '/')
      const extraOptions =
        ext === '.csv' && readOptions
          ? ', ' +
            Object.entries(readOptions)
              .map(([k, v]) => `${k}=${typeof v === 'string' ? `'${v}'` : v}`)
              .join(', ')
          : ''
      const opts =
        ext === '.csv'
          ? `auto_detect=true${extraOptions}`
          : ext === '.json'
            ? "format='auto', auto_detect=true"
            : ''

      sourceSql = `${reader}('${safeTarget}'${opts ? ', ' + opts : ''})`
    }
    const count = await this.databaseService.query(
      `SELECT COUNT(*) as count FROM ${sourceSql}`
    )
    let dups = 0
    if (uniqueKeys && uniqueKeys.length > 0) {
      const join = uniqueKeys
        .map(k => `t1."${columnMapping[k]}" = t2."${k}"`)
        .join(' AND ')
      const res = await this.databaseService.query(
        `SELECT COUNT(*) as count FROM ${sourceSql} AS t1 JOIN "${targetTableName}" AS t2 ON ${join}`
      )
      dups = Number(res[0].count)
    }
    return {
      totalRows: Number(count[0].count),
      duplicateRows: dups,
      columnMatch: { matched: [], missing: [], extra: [] },
    }
  }

  async appendData(params: AppendDataParams): Promise<{ rowCount: number }> {
    const {
      filePath,
      targetTableName,
      sourceTableName,
      uniqueKeys,
      strategy,
      columnMapping,
      tempFilePath,
      readOptions,
    } = params
    const ext = extname(filePath).toLowerCase()
    let sourceSql = ''
    if (sourceTableName) sourceSql = `"${sourceTableName}"`
    else {
      let reader = 'read_csv_auto'
      if (ext === '.json') reader = 'read_json_auto'
      else if (ext === '.parquet') reader = 'read_parquet'
      const target =
        tempFilePath && (await fs.pathExists(tempFilePath))
          ? tempFilePath
          : filePath
      const safeTarget = target.replace(/\\/g, '/')
      const extraOptions =
        ext === '.csv' && readOptions
          ? ', ' +
            Object.entries(readOptions)
              .map(([k, v]) => `${k}=${typeof v === 'string' ? `'${v}'` : v}`)
              .join(', ')
          : ''
      const opts =
        ext === '.csv'
          ? `auto_detect=true${extraOptions}`
          : ext === '.json'
            ? "format='auto', auto_detect=true"
            : ''

      sourceSql = `${reader}('${safeTarget}'${opts ? ', ' + opts : ''})`
    }
    const selects = Object.entries(columnMapping)
      .filter(([_, s]) => !!s)
      .map(([t, s]) => `"${s}" AS "${t}"`)
      .join(' , ')
    const targetCols = Object.entries(columnMapping)
      .filter(([_, s]) => !!s)
      .map(([t, _]) => `"${t}"`)
      .join(' , ')

    // [V1.7] Sequence Handling
    const seqName = this.getSequenceName(targetTableName)

    if (uniqueKeys && uniqueKeys.length > 0) {
      if (strategy === 'replace') {
        // Replace strategy means "Remove duplicates, then insert"
        const join = uniqueKeys
          .map(k => `"${targetTableName}"."${k}" = src."${columnMapping[k]}"`)
          .join(' AND ')
        await this.databaseService.exec(
          `DELETE FROM "${targetTableName}" WHERE EXISTS (SELECT 1 FROM ${sourceSql} AS src WHERE ${join})`
        )
        // Insert new with nextval
        await this.databaseService.exec(
          `INSERT INTO "${targetTableName}" (_ws_row_id, ${targetCols}) SELECT nextval('${seqName}'), ${selects} FROM ${sourceSql}`
        )
      } else if (strategy === 'update') {
        // Update strategy keeps original IDs, so no nextval needed
        const set = Object.keys(columnMapping)
          .filter(k => !uniqueKeys.includes(k) && columnMapping[k])
          .map(k => `"${k}" = src."${columnMapping[k]}"`)
          .join(' , ')
        const where = uniqueKeys
          .map(k => `"${targetTableName}"."${k}" = src."${columnMapping[k]}"`)
          .join(' AND ')
        await this.databaseService.exec(
          `UPDATE "${targetTableName}" SET ${set} FROM ${sourceSql} AS src WHERE ${where}`
        )
      } else {
        // Append (Skip Duplicates)
        const notEx = uniqueKeys
          .map(k => `tgt."${k}" = src."${columnMapping[k]}"`)
          .join(' AND ')
        await this.databaseService.exec(
          `INSERT INTO "${targetTableName}" (_ws_row_id, ${targetCols}) SELECT nextval('${seqName}'), ${selects} FROM ${sourceSql} AS src WHERE NOT EXISTS (SELECT 1 FROM "${targetTableName}" AS tgt WHERE ${notEx})`
        )
      }
    } else {
      // Simple Append
      await this.databaseService.exec(
        `INSERT INTO "${targetTableName}" (_ws_row_id, ${targetCols}) SELECT nextval('${seqName}'), ${selects} FROM ${sourceSql}`
      )
    }
    const count = await this.databaseService.query(
      `SELECT COUNT(*) as count FROM "${targetTableName}" `
    )
    return { rowCount: Number(count[0].count) }
  }

  private getSequenceName(tableName: string): string {
    return `seq_${tableName}`
  }

  // [V1.7] Cascade Deletion
  async deleteTable(tableName: string): Promise<void> {
    const seqName = this.getSequenceName(tableName)
    const sidecarName = `${tableName}_ext_ai`
    
    // 1. Drop Sidecar
    await this.databaseService.exec(`DROP TABLE IF EXISTS "${sidecarName}"`)
    
    // 2. Drop Sequence
    await this.databaseService.exec(`DROP SEQUENCE IF EXISTS "${seqName}"`)
    
    // 3. Drop Main Table
    await this.databaseService.exec(`DROP TABLE IF EXISTS "${tableName}"`)
  }

  private async detectCsvEncoding(
    safePath: string
  ): Promise<Record<string, unknown>> {
    const strategies = [
      { name: 'Default', options: { auto_detect: true } },
      { name: 'GBK', options: { encoding: 'GBK', auto_detect: true } },
      {
        name: 'GB18030',
        options: { encoding: 'GB18030', auto_detect: true },
      },
      {
        name: 'IgnoreErrors',
        options: { ignore_errors: true, auto_detect: true },
      },
      // Fallback: If strict auto_detect fails, try more lenient settings?
      // Currently we stick to the defines strategies.
    ]

    let lastError: unknown

    for (const strategy of strategies) {
      try {
        const optStr = Object.entries(strategy.options)
          .map(([k, v]) => `${k}=${typeof v === 'string' ? `'${v}'` : v}`)
          .join(', ')
        
        // Use DESCRIBE to validate the read strategy rapidly
        await this.databaseService.query(
          `DESCRIBE SELECT * FROM read_csv_auto('${safePath}', ${optStr})`
        )
        return strategy.options as Record<string, unknown>
      } catch (e) {
        lastError = e
      }
    }

    throw new Error(`Failed to parse CSV: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`)
  }
}
