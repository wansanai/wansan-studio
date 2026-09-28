import { FileNode, RelationSuggestion, TableSchema } from '@shared/types'
import { processSampleValue } from '@shared/serialization'

/**
 * Maps a FileNode (Store/UI entity) to a TableSchema (AI context entity).
 * Implements "Schema Masking": if metrics exist, use 'v_' prefix for the table name
 * to ensure the AI uses the DuckDB View instead of the raw table.
 */
export function mapFileToSchema(
  file: FileNode,
  allFiles: FileNode[] = [],
  options?: { skipMetrics?: boolean; skipRelations?: boolean; disableMasking?: boolean }
): TableSchema {
  const hasViewSchema = !!file.viewSchema && file.viewSchema.length > 0
  const hasMetrics =
    !options?.skipMetrics && file.smartMetrics && file.smartMetrics.length > 0

  // Schema Masking: Use 'v_' prefix if we have a view schema OR metrics (unless disabled)
  const useView = !options?.disableMasking && (hasViewSchema || hasMetrics)
  const exposedTableName = useView
    ? `v_${file.tableName || `table_${file.id}`}`
    : file.tableName || `table_${file.id}`

  // Map relations: Convert targetFileId to actual targetTableName (respecting masking)
  const relations = options?.skipRelations
    ? []
    : (file.relations || [])
        .map(rel => {
          const targetFile = allFiles.find(f => f.id === rel.targetFileId)
          if (!targetFile) return null

          // Resolve target table name (respect masking)
          const targetHasView =
            !options?.disableMasking &&
            ((targetFile.viewSchema && targetFile.viewSchema.length > 0) ||
              (!options?.skipMetrics &&
                targetFile.smartMetrics &&
                targetFile.smartMetrics.length > 0))

          const targetName = targetHasView
            ? `v_${targetFile.tableName}`
            : targetFile.tableName

          return {
            sourceTable: exposedTableName,
            sourceColumn: rel.sourceColumn,
            targetTable: targetName,
            targetColumn: rel.targetColumn,
            confidence: 1.0,
            reason: 'User defined relationship',
          } satisfies RelationSuggestion
        })
        .filter((r): r is RelationSuggestion => r !== null)

  // Construct Columns
  let finalColumns = file.columns.map(col => ({
    ...col,
    sampleValues: (col.sampleValues || []).map(val =>
      processSampleValue(val, col.type)
    ),
  }))

  // [V1.7] If View Schema exists, use it as the source of truth for columns
  // But merge back samples from original columns
  if (hasViewSchema && file.viewSchema) {
    finalColumns = file.viewSchema
      .filter(viewCol => {
        // Context Pruning:
        // 1. Keep original columns
        const isOriginal = file.columns.some(c => c.name === viewCol.name)
        if (isOriginal) return true

        // 2. Keep Sidecar/AI columns (usually don't have '__')
        // 3. Keep Time Intelligence (e.g. Sales_MoM)
        if (viewCol.name.endsWith('_MoM') || viewCol.name.endsWith('_YoY')) return true

        // 4. Remove Joined Columns (convention: table__col)
        // Assumption: Joined columns contain '__'. Original/AI columns do not (or rarely).
        return !viewCol.name.includes('__')
      })
      .map(viewCol => {
        // Try to find original column to get samples and semantic
        const originalCol = file.columns.find(c => c.name === viewCol.name)
        return {
          ...viewCol,
          sampleValues: originalCol
            ? (originalCol.sampleValues || []).map(val => processSampleValue(val, originalCol.type))
            : [], // Generated columns (MoM, Sidecar) won't have samples yet
          semantic: originalCol?.semantic,
          userType: originalCol?.userType
        }
      })
  }

  return {
    tableName: exposedTableName,
    description: useView ? `${file.name} (Enriched View)` : file.name,
    rowCount: file.rowCount, // Pass rowCount for AI optimization
    columns: finalColumns,
    // If we use viewSchema, metrics are already "baked in" as columns, so we don't strictly need to pass them separately.
    // However, keeping them might help AI understand the formula.
    // But duplicate definitions might confuse it.
    // Strategy: If viewSchema is used, we DON'T pass smartMetrics as separate entities to avoid hallucination about "creating" them.
    // The columns are already there.
    smartMetrics: hasViewSchema ? [] : (options?.skipMetrics ? [] : file.smartMetrics),
    relations,
  }
}
