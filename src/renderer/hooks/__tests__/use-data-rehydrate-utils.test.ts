import { describe, expect, it, vi } from 'vitest'
import type { FileNode } from '@shared/types'
import {
  getOrphanTables,
  rehydrateProjectData,
  type RehydrateActions,
  type RehydrateAPI,
} from '../use-data-rehydrate-utils'

function createFile(overrides: Partial<FileNode> = {}): FileNode {
  return {
    id: 'file-1',
    name: 'Orders',
    tableName: 'orders',
    source: {
      type: 'local_file',
      path: '/tmp/orders.csv',
    },
    status: 'ready',
    progress: 100,
    size: 0,
    columns: [
      {
        name: 'amount',
        safeName: 'amount',
        type: 'DECIMAL',
        sampleValues: [],
      },
    ],
    rowCount: 10,
    lastModified: 1,
    createdAt: 1,
    ...overrides,
  }
}

function createActions(files: FileNode[]): RehydrateActions {
  return {
    setRestoring: vi.fn(),
    reloadFile: vi.fn(),
    markAsStale: vi.fn(),
    updateFile: vi.fn(),
    markFileMissing: vi.fn(),
    refreshFileMetadata: vi.fn().mockResolvedValue(undefined),
    getFiles: () => files,
  }
}

describe('use-data-rehydrate-utils', () => {
  it('会识别并跳过合法 sidecar，仅清理真正孤儿表', () => {
    const files = [createFile({ tableName: 'orders' })]
    const orphans = getOrphanTables(files, ['orders', 'orders__ext', 'legacy_table'])

    expect(orphans).toEqual(['legacy_table'])
  })

  it('底表缺失时会重导本地文件并刷新元数据', async () => {
    const files = [createFile()]
    const api: RehydrateAPI = {
      runSQL: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: { data: [{ table_name: 'orders__ext' }] },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { data: [] },
        }),
      deleteTable: vi.fn(),
      reIngestFile: vi.fn().mockResolvedValue({
        success: true,
        data: {
          lastModified: 2,
          newColumns: files[0].columns,
        },
      }),
    }
    const actions = createActions(files)

    await rehydrateProjectData(files, api, actions)

    expect(actions.setRestoring).toHaveBeenCalledWith(true)
    expect(api.reIngestFile).toHaveBeenCalledWith({
      fileId: 'file-1',
      filePath: '/tmp/orders.csv',
      tableName: 'orders',
      sheetName: undefined,
      columns: files[0].columns,
      readOptions: undefined,
    })
    expect(actions.reloadFile).toHaveBeenCalledWith('file-1', {
      lastModified: 2,
      newColumns: files[0].columns,
    })
    expect(actions.refreshFileMetadata).toHaveBeenCalledWith('file-1')
    expect(actions.setRestoring).toHaveBeenLastCalledWith(false)
  })

  it('无法自动恢复时会降级为 stale/error 或 missing', async () => {
    const files = [
      createFile({
        id: 'db-1',
        source: {
          type: 'database',
          connectionId: 'conn-1',
          table: 'orders',
        },
      }),
      createFile({
        id: 'file-missing',
        tableName: 'payments',
        source: {
          type: 'local_file',
          path: '/tmp/payments.csv',
        },
      }),
    ]

    const api: RehydrateAPI = {
      runSQL: vi
        .fn()
        .mockResolvedValueOnce({ success: true, data: { data: [] } })
        .mockResolvedValueOnce({ success: true, data: { data: [] } })
        .mockResolvedValueOnce({ success: true, data: { data: [] } }),
      deleteTable: vi.fn(),
      reIngestFile: vi.fn().mockResolvedValue({
        success: false,
        error: 'ENOENT: source file missing',
      }),
    }
    const actions = createActions(files)

    await rehydrateProjectData(files, api, actions)

    expect(actions.markAsStale).toHaveBeenCalledWith(['db-1'])
    expect(actions.updateFile).toHaveBeenCalledWith('db-1', {
      status: 'error',
      error: 'Database table missing. Manual re-sync required.',
    })
    expect(actions.markFileMissing).toHaveBeenCalledWith('file-missing')
  })
})
