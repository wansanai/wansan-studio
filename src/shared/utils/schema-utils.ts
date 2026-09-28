/**
 * Schema Utilities - Unified column handling logic.
 */

/**
 * Checks if a column is a system-internal column (e.g., starts with _ws_).
 */
export const isSystemColumn = (columnName: string): boolean => {
  return columnName.startsWith('_ws_')
}

/**
 * Filters out system columns from an array of objects that have a 'name' property.
 * Works with ColumnSchema, ColumnField, etc.
 */
export const getVisibleColumns = <T extends { name: string }>(columns: T[]): T[] => {
  return columns.filter(col => !isSystemColumn(col.name))
}

/**
 * Finds the first visible column in a list.
 */
export const getFirstVisibleColumn = <T extends { name: string }>(columns: T[]): T | undefined => {
  return columns.find(col => !isSystemColumn(col.name))
}
