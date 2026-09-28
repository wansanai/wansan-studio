/**
 * Generates the standardized column name for joined dimensions.
 * Format: "${foreignKey}__${targetColumn}"
 * Example: product_id__base_price
 */
export function getJoinedColumnName(
  prefix: string,
  columnName: string
): string {
  return `${prefix}__${columnName}`
}

export function sanitizeTableName(
  originalName: string,
  sheetName?: string,
  prefix: string = 't_'
): string {
  // 1. Remove extension
  let baseName = originalName.replace(/\.[^/.]+$/, '') || originalName

  // 2. Handle Sheet names
  if (sheetName && sheetName !== originalName) {
    baseName = `${baseName}_${sheetName}`
  }

  // 3. Clean characters: Allow Chinese, alphanum, underscore. Replace others with _
  let safeName = baseName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
  
  // 4. Force prefix
  if (!safeName.startsWith(prefix)) {
    safeName = prefix + safeName
  }

  // 5. Cleanup underscores
  safeName = safeName.replace(/_+/g, '_').replace(/_$/, '').replace(/^_+/, '')

  return safeName.toLowerCase()
}

/**
 * Generates a friendly display name by removing extensions and merging sheet info.
 */
export function cleanDisplayName(fileName: string, sourceName?: string): string {
  const nameNoExt = fileName.replace(/\.[^/.]+$/, '')
  if (!sourceName || sourceName === fileName) {
    return nameNoExt
  }
  return `${nameNoExt} - ${sourceName}`
}

/**
 * Parses a joined column name back to its components.
 */
export function parseJoinedColumnName(
  name: string
): { prefix: string; column: string } | null {
  const parts = name.split('__')
  if (parts.length < 2) return null
  return { prefix: parts[0], column: parts.slice(1).join('__') }
}

/**
 * Sanitizes a string for use as a filename by replacing illegal characters.
 */
export function sanitizeFilename(name: string, fallback: string = 'file'): string {
  if (!name) return fallback
  // Replace illegal filename characters with underscore
  return name.replace(/[\\/?*:!|"<>.]/g, '_') || fallback
}

/**
 * Standard naming for sidecar tables (AI augmentation, manual corrections, etc.)
 */
export function getSidecarTableName(tableName: string): string {
  return `${tableName}__ext`
}

/**
 * Standard naming for logical views (Unified schema for AI and Grid)
 */
export function getLogicalViewName(tableName: string): string {
  return `v_${tableName}`
}
