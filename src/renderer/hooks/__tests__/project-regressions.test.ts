import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectLoadResult } from '@shared/types/project-manifest'
import type { ProjectData } from '@shared/types/project'
import { shouldShowDataWorkspace } from '@/components/main-content-utils'

function createMemoryStorage() {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  } as Storage
}

function createProjectState(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    meta: {
      id: 'project-1',
      name: 'Demo',
      version: '1.1.0',
      created: 1,
    },
    files: [
      {
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
            nullable: true,
            isPrimaryKey: false,
            semantic: { description: '订单金额' },
          },
        ],
        rowCount: 10,
        lastModified: 1,
        createdAt: 1,
        smartMetrics: [],
        relations: [],
      },
    ],
    sessions: [],
    activeSessionId: '',
    activeView: 'chat',
    activeFileId: 'file-1',
    widgetRegistry: {},
    appMode: 'analysis',
    domainRules: [
      {
        id: 'rule-1',
        content: '金额必须按人民币解释',
        isEnabled: true,
        createdAt: 1,
      },
      {
        id: 'rule-2',
        content: '已禁用规则',
        isEnabled: false,
        createdAt: 2,
      },
    ],
    suggestedPrompts: ['按地区汇总销售额'],
    tableViews: {
      'file-1': [
        {
          id: 'view-1',
          name: '默认视图',
          filters: { conjunction: 'AND', conditions: [] },
          meta: {
            updatedAt: 1,
            filterCount: 0,
            hiddenCount: 0,
            sortCount: 0,
          },
        },
      ],
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('navigator', { language: 'en-US' })
  vi.stubGlobal('localStorage', createMemoryStorage())
})

describe('project persistence regressions', () => {
  it('buildProjectSemantic 会保留启用的项目级规则', async () => {
    const { buildProjectSemantic } = await import('@/components/main-content-utils')
    const semantic = buildProjectSemantic(createProjectState())

    expect(semantic.suggestedPrompts).toEqual(['按地区汇总销售额'])
    expect(semantic.domainRules).toEqual(['金额必须按人民币解释'])
    expect(semantic.tables['file-1'].columns.amount).toEqual({
      description: '订单金额',
    })
  })

  it('buildProjectDataFromLoadResult 会恢复项目级规则', async () => {
    const { buildProjectDataFromLoadResult } = await import('@/components/main-content-utils')
    const data: ProjectLoadResult = {
      path: '/tmp/demo.wansan',
      manifest: {
        meta: {
          id: 'project-1',
          name: 'Demo',
          version: '0.5.0',
          createdAt: 1,
          updatedAt: 1,
          engine: 'native',
        },
        assets: [
          {
            id: 'file-1',
            name: 'Orders',
            tableName: 'orders',
            source: {
              type: 'local_file',
              path: '/tmp/orders.csv',
            },
            status: 'ready',
            rowCount: 10,
            lastModified: 1,
            createdAt: 1,
            columns: [
              {
                name: 'amount',
                safeName: 'amount',
                type: 'DECIMAL',
                sampleValues: [],
                nullable: true,
                isPrimaryKey: false,
              },
            ],
          },
        ],
        tableViews: {
          'file-1': [
            {
              id: 'view-1',
              name: '默认视图',
              filters: { conjunction: 'AND', conditions: [] },
              meta: {
                updatedAt: 1,
                filterCount: 0,
                hiddenCount: 0,
                sortCount: 0,
              },
            },
          ],
        },
        settings: {
          theme: 'light',
        },
      },
      semantic: {
        tables: {
          'file-1': {
            columns: {
              amount: { description: '订单金额' },
            },
            smartMetrics: [],
            relations: [],
          },
        },
        domainRules: ['金额必须按人民币解释'],
        suggestedPrompts: ['按地区汇总销售额'],
      },
      session: {
        sessions: [],
        activeSessionId: '',
        activeView: 'chat',
        activeFileId: 'file-1',
        widgetRegistry: {},
      },
    }

    const projectData = buildProjectDataFromLoadResult(data)

    expect(projectData.domainRules).toEqual([
      {
        id: 'project-rule-0',
        content: '金额必须按人民币解释',
        isEnabled: true,
        createdAt: 0,
      },
    ])
    expect(projectData.suggestedPrompts).toEqual(['按地区汇总销售额'])
    expect(projectData.tableViews).toEqual(data.manifest.tableViews)
  })

  it('schema/preview 视图仍应显示 DataWorkspace', () => {
    expect(shouldShowDataWorkspace('analysis', 'schema')).toBe(true)
    expect(shouldShowDataWorkspace('analysis', 'preview')).toBe(true)
    expect(shouldShowDataWorkspace('data', 'chat')).toBe(true)
    expect(shouldShowDataWorkspace('analysis', 'chat')).toBe(false)
  })

  it('自动保存会把新持久化字段视为脏变更', async () => {
    const { hasPersistentProjectChanges } = await import('@/components/main-content-utils')
    const baseState = {
      ...createProjectState(),
      currentProjectPath: '/tmp/demo.wansan',
      sidebarMode: 'sessions' as const,
      layoutScenario: 'default' as const,
      editingReportId: null,
      pendingReplace: null,
      showRefreshConfirm: false,
      selectedNode: null,
      isRestoring: false,
      isRefreshing: false,
      abortControllers: {},
      smartFilterRequest: null,
      analysisReviewResult: null,
      isSmartModelingOpen: false,
      isProjectLoaded: true,
    }

    expect(
      hasPersistentProjectChanges(
        {
          ...baseState,
          tableViews: { 'file-1': [] },
        } as unknown as Parameters<typeof hasPersistentProjectChanges>[0],
        baseState as unknown as Parameters<typeof hasPersistentProjectChanges>[1]
      )
    ).toBe(true)

    expect(
      hasPersistentProjectChanges(
        {
          ...baseState,
          suggestedPrompts: ['新的提示'],
        } as unknown as Parameters<typeof hasPersistentProjectChanges>[0],
        baseState as unknown as Parameters<typeof hasPersistentProjectChanges>[1]
      )
    ).toBe(true)

    expect(
      hasPersistentProjectChanges(
        {
          ...baseState,
          domainRules: [
            {
              id: 'rule-3',
              content: '新规则',
              isEnabled: true,
              createdAt: 0,
            },
          ],
        } as unknown as Parameters<typeof hasPersistentProjectChanges>[0],
        baseState as unknown as Parameters<typeof hasPersistentProjectChanges>[1]
      )
    ).toBe(true)
  })
})
