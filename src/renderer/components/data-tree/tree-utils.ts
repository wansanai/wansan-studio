import { FileNode, SyncStatus } from '@shared/types'
import { Relation } from '@shared/types/project'

export interface TreeNodeData {
  id: string
  name: string
  alias?: string // [NEW] v4.0
  type: 'folder' | 'file' | 'column' | 'relation'
  children?: TreeNodeData[]
  // Original data references
  fileId?: string
  columnName?: string
  relationId?: string
  // Display metadata
  columnType?: string
  isKey?: boolean // Is Primary Key (or similar concept in our simple app)
  isForeignKey?: boolean // Is part of a relation
  status?: SyncStatus
  format?: string // [NEW] 'excel' | 'csv' | 'parquet' | 'json'
  sourceType?: 'local_file' | 'database' // [NEW]
}

export const NODE_TYPES = {
  FOLDER: 'folder',
  FILE: 'file',
  COLUMN: 'column',
  RELATION: 'relation',
} as const

/**
 * Transforms Store data into a Tree structure
 */
export function buildTreeData(
  files: FileNode[],
  relations: Relation[]
): TreeNodeData[] {
  // 1. Build File Nodes (Data Sources)
  const fileNodes: TreeNodeData[] = files.map(file => {
    // Check if any column in this file is involved in a relation
    const relatedColumns = new Set<string>()
    relations.forEach(rel => {
      if (rel.fileAId === file.id) relatedColumns.add(rel.columnA)
      if (rel.fileBId === file.id) relatedColumns.add(rel.columnB)
    })

    const columnNodes: TreeNodeData[] = file.columns
      .filter(col => col.name !== '_ws_row_id')
      .map(col => ({
        id: `col:${file.id}:${col.name}`,
        name: col.name,
        alias: col.semantic?.aliases?.[0], // [V4.0]
        type: 'column',
        fileId: file.id,
        columnName: col.name,
        columnType: col.type,
        isKey: col.isPrimaryKey,
        isForeignKey: relatedColumns.has(col.name),
      }))

    return {
      id: `file:${file.id}`,
      name: file.name || file.tableName, // Prefer original filename for display
      type: 'file',
      fileId: file.id,
      children: columnNodes,
      status: file.status,
      sourceType: file.source.type,
      format:
        file.source.type === 'local_file'
          ? file.source.format ||
            (file.name.toLowerCase().endsWith('.csv')
              ? 'csv'
              : file.name.toLowerCase().endsWith('.json')
                ? 'json'
                : file.name.toLowerCase().endsWith('.parquet')
                  ? 'parquet'
                  : file.name.toLowerCase().match(/\.xlsx?$/)
                    ? 'excel'
                    : undefined)
          : undefined,
    }
  })

  // 2. Build Relation Nodes (Removed as per requirement)

  // 3. Return only File Nodes (Flattened for a cleaner look in sidebar)
  return fileNodes
}

/**
 * Helper to parse node IDs for actions
 */
export function parseNodeId(id: string) {
  const parts = id.split(':')
  // Handle root nodes
  if (id.startsWith('root_')) {
    return { type: 'folder', id }
  }

  const type = parts[0]

  if (type === 'file') {
    return { type: 'file', id: parts[1] }
  }

  if (type === 'col') {
    return { type: 'column', parentId: parts[1], id: parts[2] } // id here is columnName
  }

  if (type === 'rel') {
    return { type: 'relation', id: parts[1] }
  }

  return { type: 'unknown', id }
}
