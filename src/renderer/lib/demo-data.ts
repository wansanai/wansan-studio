import { useProjectStore } from '../stores/useProjectStore'
import { FileNode } from '@shared/types'

import { generateId } from '@shared/utils.ts'
import { DEMO_DATA } from '@shared/demo-data.ts'

export { DEMO_DATA } from '../../shared/demo-data'

export async function loadDemoData(
  suggestedPrompts?: string[]
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const fileId = generateId()
    const tableName = 't_demo_superstore'

    // 1. 摄取到 DuckDB
    const result = await window.electronAPI.ingestJson({
      tableName,
      rows: DEMO_DATA
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to ingest demo data')
    }

    // 2. 创建 FileNode
    const fileNode: FileNode = {
      id: fileId,
      name: 'Superstore_Demo.csv',
      source: {
        type: 'local_file',
        path: 'DEMO_MEMORY',
      },
      status: 'ready',
      tableName: tableName,
      columns: (result as any).data?.columns || [],
      lastModified: Date.now(),
      createdAt: Date.now(),
    }

    // 3. 更新 FileStore
    useProjectStore.getState().addFile(fileNode)
    useProjectStore.getState().setActiveFile(fileId)

    // Switch view
    useProjectStore.getState().setView('schema')

    // 4. 预填充建议提示词（如果提供）
    if (suggestedPrompts && suggestedPrompts.length > 0) {
      useProjectStore.getState().setSuggestedPrompts(suggestedPrompts)
    }

    return { success: true, fileId }
  } catch (error) {
    console.error('Load demo data error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
