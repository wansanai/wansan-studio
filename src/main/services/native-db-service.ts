import { formatForDisplay } from '../../shared/serialization'
import type { GetSchemaResponse } from '../../shared/api-types'
import { dbClient } from './db-service/client'

type QuerySchemaMeta = {
  columnFields?: Array<{ name: string; type: string }>
}

export class NativeDatabaseService {
  constructor() {}

  async initialize(dbPath?: string): Promise<void> {
    console.log('[NativeDB] Initializing service adapter...')
    await dbClient.init()
    await dbClient.connect(dbPath)
    console.log(
      `[NativeDB] Service adapter initialized. Path: ${dbPath || ':memory:'}`
    )
  }

  async query(sql: string): Promise<Record<string, unknown>[]> {
    console.log('[NativeDB] Query:', sql)
    return dbClient.executeQuery(sql)
  }

  async queryWithSchema(sql: string): Promise<{
    data: Record<string, unknown>[]
    columnFields: Array<{ name: string; type: string }>
  }> {
    console.log('[NativeDB] QueryWithSchema:', sql)
    const res = await dbClient.executeQueryFull(sql)
    const data = res.data || []
    const columnFields =
      (res.meta as QuerySchemaMeta | undefined)?.columnFields || []

    if (data.length > 0 && columnFields.length > 0) {
      const dateColumns = columnFields.filter((column) => {
        const type = column.type.toUpperCase()
        return type.includes('DATE') || type.includes('TIMESTAMP')
      })

      if (dateColumns.length > 0) {
        for (const row of data) {
          for (const column of dateColumns) {
            if (row[column.name] !== null && row[column.name] !== undefined) {
              row[column.name] = formatForDisplay(
                row[column.name],
                column.type
              )
            }
          }
        }
      }
    }

    return {
      data,
      columnFields,
    }
  }

  async exec(sql: string): Promise<void> {
    console.log('[NativeDB] Exec:', sql)
    await dbClient.executeQuery(sql)
  }

  async getSchema(tableName?: string): Promise<GetSchemaResponse['data']> {
    return (await dbClient.getSchema(tableName)) as GetSchemaResponse['data']
  }

  async checkpoint(): Promise<void> {
    await dbClient.checkpoint()
  }

  async dropAllTables(): Promise<void> {
    const schema = await this.getSchema()
    const tables = schema?.tables ?? []

    for (const table of tables) {
      await dbClient.deleteTable(table.tableName)
    }
  }

  async close(): Promise<void> {
    await dbClient.stop()
  }
}
