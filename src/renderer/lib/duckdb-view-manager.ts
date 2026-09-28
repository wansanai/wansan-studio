import { ColumnSchema, ColumnType, FileNode } from '@shared/types'
import { Relation } from '@shared/types/project'
import { getJoinedColumnName, parseJoinedColumnName, getSidecarTableName, getLogicalViewName } from '@shared/naming-utils'
import { normalizeDuckDBType } from '@shared/type-utils'

type TableInfoRow = {
  name: string
}

type DescribeRow = {
  column_name: string
  column_type: string
}

/**
 * Escapes regex special characters.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Internal helper to build column mappings and JOIN clauses.
 */
function prepareViewContext(
  file: FileNode,
  allFiles: FileNode[],
  relations: Relation[]
) {
  const colMap = new Map<string, string>()
  const selectDimensionClauses: string[] = []
  const joinClauses: string[] = []

  // 1. Map Native Columns
  for (const col of file.columns) {
    colMap.set(col.name, `T1."${col.name}" `)
  }

  // 2. Identify Relations & Build Joins
  const activeRelations = relations.filter(r => r.fileAId === file.id)

  activeRelations.forEach((rel, index) => {
    const targetFile = allFiles.find(f => f.id === rel.fileBId)
    if (!targetFile) return

    const alias = `T_${index + 2}` // T1 is base
    const prefix = rel.columnA

    joinClauses.push(
      `LEFT JOIN "${targetFile.tableName}" AS ${alias} ON T1."${rel.columnA}" = ${alias}."${rel.columnB}"`
    )

    for (const col of targetFile.columns) {
      // [Optimization] Exclude System Columns
      if (col.name === '_ws_row_id') continue
      // [Optimization] Exclude Redundant Join Key (already in T1)
      if (col.name === rel.columnB) continue
      // [Optimization] Exclude Hidden Columns
      if (col.semantic?.isVisibleToAI === false) continue

      const userColName = getJoinedColumnName(prefix, col.name)
      const physicalPath = `${alias}."${col.name}"`
      selectDimensionClauses.push(`${physicalPath} AS "${userColName}" `)
      colMap.set(userColName, physicalPath)
    }
  })

  return { colMap, selectDimensionClauses, joinClauses }
}

/**
 * Resolves a user-friendly SQL expression into a physical one using table aliases.
 */
function resolveExpression(expression: string, colMap: Map<string, string>): string {
  let resolvedExpr = expression
  // Sort by length desc to avoid partial replacements
  const sortedUserCols = Array.from(colMap.keys()).sort(
    (a, b) => b.length - a.length
  )

  for (const userCol of sortedUserCols) {
    const physicalPath = colMap.get(userCol)!
    // Match the column name either quoted or unquoted as a whole word
    const escaped = escapeRegExp(userCol)
    const regex = new RegExp(`("${escaped}")|(\\b${escaped}\\b)`, 'g')
    resolvedExpr = resolvedExpr.replace(regex, physicalPath)
  }

  return resolvedExpr
}

/**
 * Checks for sidecar table (AI Augmentation) and returns relevant SQL parts.
 */
async function getSidecarParts(tableName: string) {
  const sidecarName = getSidecarTableName(tableName)
  const result = { selects: [] as string[], join: '' }
  const colMapUpdates = new Map<string, string>()

  try {
    const checkRes = await window.electronAPI.runSQL(
      `SELECT table_name FROM information_schema.tables WHERE table_name = '${sidecarName}'`
    )

    if (!checkRes.success || !checkRes.data?.data?.length) {
      return { result, colMapUpdates }
    }

    const colsRes = await window.electronAPI.runSQL(`PRAGMA table_info('${sidecarName}')`)
    if (!colsRes.success || !colsRes.data) {
      return { result, colMapUpdates }
    }

    result.join = `LEFT JOIN "${sidecarName}" AS T_AI ON T1._ws_row_id = T_AI._ws_row_id`

    for (const row of colsRes.data.data as TableInfoRow[]) {
      const colName = row.name
      if (colName === '_ws_row_id') continue

      const path = `T_AI."${colName}" `
      result.selects.push(`${path}`)
      colMapUpdates.set(colName, path)
    }
  } catch (e) {
    console.warn(`[DuckDBViewManager] Sidecar check failed for ${tableName}:`, e)
  }

  return { result, colMapUpdates }
}

export const DuckDBViewManager = {
  /**
   * Rebuilds the "Wide View" (v_{tableName}) for a given file.
   * Returns the full schema of the view (Columns + Types).
   */
  async rebuildView(
    file: FileNode,
    allFiles: FileNode[],
    relations: Relation[]
  ): Promise<ColumnSchema[]> {
    const { colMap, selectDimensionClauses, joinClauses } = prepareViewContext(
      file,
      allFiles,
      relations
    )

    // Sidecar (AI Augmentation)
    const { result: sidecar, colMapUpdates } = await getSidecarParts(file.tableName)
    if (sidecar.join) joinClauses.push(sidecar.join)
    for (const [key, val] of colMapUpdates) {
      colMap.set(key, val)
    }

    const selectClauses = [
      `T1.*`,
      ...sidecar.selects,
      ...selectDimensionClauses
    ]

    // Smart Metrics (User Defined)
    if (file.smartMetrics?.length) {
      for (const metric of file.smartMetrics) {
        const resolvedExpr = resolveExpression(metric.sqlExpression, colMap)
        selectClauses.push(`(${resolvedExpr}) AS "${metric.name}" `)
      }
    }

    const viewName = getLogicalViewName(file.tableName)
    const sql = `
      CREATE OR REPLACE VIEW "${viewName}" AS
      SELECT
        ${selectClauses.join(',\n        ')}
      FROM "${file.tableName}" AS T1
      ${joinClauses.join('\n      ')}
    `

    try {
      const res = await window.electronAPI.runSQL(sql)
      if (!res.success) {
        throw new Error(res.error || 'Failed to create logical view')
      }

      const descRes = await window.electronAPI.runSQL(`DESCRIBE "${viewName}" `)
      if (!descRes.success || !descRes.data) {
        throw new Error(descRes.error || 'Failed to describe view')
      }

      return descRes.data.data.map((row: DescribeRow) => {
        const colName = row.column_name
        let sourceType: import('@shared/types').ColumnSourceType = 'raw'
        
        // 1. Infer source type
        if (file.smartMetrics?.some(m => m.name === colName)) {
          sourceType = 'metric'
        } else if (colName.includes('__')) {
          sourceType = 'joined'
        } else if (colMapUpdates.has(colName)) {
          sourceType = 'ai'
        } else if (colName.endsWith('_MoM') || colName.endsWith('_YoY')) {
          sourceType = 'metric'
        }

        // 2. Recover Semantic Info
        let semantic = undefined
        let samples = []

        if (sourceType === 'raw') {
          const originalCol = file.columns.find(c => c.name === colName)
          semantic = originalCol?.semantic
          samples = originalCol?.sampleValues || []
        } else if (sourceType === 'joined') {
          const parsed = parseJoinedColumnName(colName)
          if (parsed) {
            // Find relation to identify target table
            const rel = relations.find(r => r.fileAId === file.id && r.columnA === parsed.prefix)
            if (rel) {
              const targetFile = allFiles.find(f => f.id === rel.fileBId)
              const targetCol = targetFile?.columns.find(c => c.name === parsed.column)
              semantic = targetCol?.semantic
              samples = targetCol?.sampleValues || []
            }
          }
        }

        return {
          name: colName,
          safeName: colName,
          type: normalizeDuckDBType(row.column_type),
          sampleValues: samples,
          sourceType,
          semantic
        }
      })
    } catch (e) {
      console.error('[DuckDBViewManager] Rebuild failed:', e)
      throw e
    }
  },

  /**
   * Tests a single metric expression using the same JOIN and resolution rules.
   */
  async testMetricExpression(
    file: FileNode,
    expression: string,
    allFiles: FileNode[],
    relations: Relation[]
  ): Promise<{ value: unknown; dataType: ColumnType }> {
    const { colMap, joinClauses } = prepareViewContext(
      file,
      allFiles,
      relations
    )
    const resolvedExpr = resolveExpression(expression, colMap)

    const testSql = `
      SELECT (${resolvedExpr}) AS test_result
      FROM "${file.tableName}" AS T1
      ${joinClauses.join('\n      ')}
      LIMIT 1
    `

    const res = await window.electronAPI.runSQL(testSql)
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Test query failed')
    }

    const row = res.data.data[0]
    return {
      value: row ? row.test_result : null,
      dataType: normalizeDuckDBType(
        res.data.columnFields.find((field) => field.name === 'test_result')?.type || 'UNKNOWN'
      ),
    }
  },
}
