import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useWizardStore } from '@/stores/useWizardStore'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Edit2,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { DBConnectionConfig } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { IngestionTask } from '@shared/types/wizard'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip'

const BUSINESS_TYPES = [
  { id: 'postgres', name: 'PostgreSQL', icon: 'P' },
  { id: 'mysql', name: 'MySQL', icon: 'M' },
]

interface TableItemProps {
  name: string
  schema?: string
  fullId: string
  isSelected: boolean
  isAlreadyInTasks: boolean
  onToggle: (table: { name: string; schema?: string }) => void
}

const TableItemCard = React.memo(
  ({
    name,
    schema,
    fullId,
    isSelected,
    isAlreadyInTasks,
    onToggle,
  }: TableItemProps) => {
    const { t } = useTranslation('common')
    return (
      <TooltipProvider>
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <div
              onClick={() => !isAlreadyInTasks && onToggle({ name, schema })}
              className={cn(
                'relative h-14 px-4 py-2 border rounded-xl flex items-center gap-3',
                isSelected
                  ? 'border-indigo-600 bg-white ring-2 ring-indigo-50 shadow-md z-10'
                  : 'border-zinc-100 bg-white hover:border-zinc-300 hover:shadow-sm',
                isAlreadyInTasks
                  ? 'opacity-40 cursor-not-allowed grayscale bg-zinc-50/50'
                  : 'cursor-pointer active:scale-95'
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-100 text-zinc-400'
                )}
              >
                <Database className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[13px] font-bold text-zinc-900 truncate block leading-tight pb-0.5">
                  {name}
                </span>
                {isAlreadyInTasks ? (
                  <span className="text-[9px] text-indigo-500 font-black uppercase tracking-tighter mt-1">
                    {t('selected_data')}
                  </span>
                ) : (
                  <span className="text-[9px] text-zinc-400 font-mono mt-1 truncate">
                    {schema || 'default'}
                  </span>
                )}
              </div>
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 bg-indigo-600 rounded-full p-0.5 shadow-sm">
                  <Check className="w-2.5 h-2.5 text-white stroke-[4]" />
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 border-none text-white rounded-lg text-[10px] font-mono">
            {fullId}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
)

TableItemCard.displayName = 'TableItemCard'

// Custom hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])
  return debouncedValue
}

export function DatabaseSelectorDialog() {
  const { isDbSelectorOpen, setDbSelectorOpen, tasks, setTasks, mode } =
    useWizardStore()
  const { dbConnections, addDBConnection, removeDBConnection, updateDBConnection } =
    useSettingsStore()
  const { t } = useTranslation('common')

  const [selectedConnId, setSelectedConnId] = useState<string | null>(null)
  const [editingConnId, setEditingConnId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [tables, setTables] = useState<
    Array<{ name: string; schema?: string }>
  >([])
  const [isLoadingTables, setIsLoadingTables] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const [visibleLimit, setVisibleLimit] = useState(100)
  
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [localSelection, setLocalSelection] = useState<
    Record<string, Record<string, { name: string; schema?: string }>>
  >({})

  // Reset pagination when data source or search changes
  useEffect(() => {
    setVisibleLimit(100)
  }, [selectedConnId, debouncedSearchQuery, tables])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    // Load more when scrolled to bottom (with 400px buffer for smoother XP)
    if (scrollHeight - scrollTop - clientHeight < 400) {
      setVisibleLimit(prev => prev + 100)
    }
  }, [])

  useEffect(() => {
    if (isDbSelectorOpen) {
      setLocalSelection({})
      if (dbConnections.length > 0 && !selectedConnId) {
        setSelectedConnId(dbConnections[0].id)
      }
    }
  }, [isDbSelectorOpen, dbConnections, selectedConnId])

  const selectedConn = dbConnections.find(c => c.id === selectedConnId)

  const fetchTables = useCallback(
    async (id: string) => {
      const conn = dbConnections.find(c => c.id === id)
      if (!conn) return

      // [V1.7] Check for password presence (Safety check after app reset)
      const pwdRes = await window.electronAPI.secureGet(`db_pass_${id}`)
      if (!pwdRes.data) {
        setEditingConnId(id)
        setIsCreating(true)
        setError(t('connector.error_password_missing'))
        return
      }

      setIsLoadingTables(true)
      setError(null)
      try {
        const res = await window.electronAPI.listDBTables(conn)
        if (res.success && res.data) setTables(res.data)
        else setError(res.error || 'Failed to list tables')
      } catch (e: any) {
        setError(e.message)
      } finally {
        setIsLoadingTables(false)
      }
    },
    [dbConnections, t]
  )

  useEffect(() => {
    if (selectedConnId) {
      void fetchTables(selectedConnId)
    } else {
      setTables([])
    }
  }, [selectedConnId, fetchTables])

  // Optimized Filtering & Sorting (Flat List)
  const filteredAndSortedTables = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase().trim()
    const filtered = q 
      ? tables.filter(
          t =>
            t.name.toLowerCase().includes(q) ||
            (t.schema && t.schema.toLowerCase().includes(q))
        )
      : tables

    // Sort by Schema then Name
    return [...filtered].sort((a, b) => {
      const schemaA = a.schema || 'public'
      const schemaB = b.schema || 'public'
      if (schemaA !== schemaB) return schemaA.localeCompare(schemaB)
      return a.name.localeCompare(b.name)
    })
  }, [tables, debouncedSearchQuery])

  // Lazy Render Slice
  const renderData = useMemo(() => {
    const items = filteredAndSortedTables.slice(0, visibleLimit)
    const hasMore = filteredAndSortedTables.length > visibleLimit
    return { items, hasMore }
  }, [filteredAndSortedTables, visibleLimit])

  const [newConn, setNewConn] = useState<Partial<DBConnectionConfig>>({
    type: 'postgres',
    port: 5432,
    host: 'localhost',
    ssl: false,
    params: ''
  })
  const [password, setPassword] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)

  // Form Validation
  const isFormValid = useMemo(() => {
    return !!(
      newConn.name &&
      newConn.host &&
      newConn.port &&
      newConn.database &&
      newConn.user
    )
  }, [newConn])

  // Reset form when entering create mode
  useEffect(() => {
    if (isCreating && !editingConnId) {
      setNewConn({
        type: 'postgres',
        port: 5432,
        host: 'localhost',
        ssl: false,
        params: ''
      })
      setPassword('')
      setShowAdvanced(false)
      setTestSuccess(false)
    }
  }, [isCreating, editingConnId])

  // Fill form when entering edit mode
  useEffect(() => {
    if (isCreating && editingConnId) {
      const conn = dbConnections.find(c => c.id === editingConnId)
      if (conn) {
        setNewConn({
          name: conn.name,
          type: conn.type,
          host: conn.host,
          port: conn.port,
          database: conn.database,
          user: conn.user,
          ssl: conn.ssl,
          params: conn.params
        })
        setPassword('')
        if (conn.ssl || conn.params) {
          setShowAdvanced(true)
        }
      }
    }
  }, [isCreating, editingConnId, dbConnections])

  const handleTestConnection = async () => {
    if (!isFormValid) return
    setIsTesting(true)
    setTestSuccess(false)
    setError(null)
    const configToTest = { ...newConn, id: editingConnId || 'temp' } as DBConnectionConfig
    try {
      const res = await window.electronAPI.testDBConnection({
        config: configToTest,
        password: password || undefined
      })
      if (res.success) setTestSuccess(true)
      else setError(res.error || 'Connection failed')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsTesting(false)
    }
  }

  const handleSaveConnection = async () => {
    if (!isFormValid) return
    
    if (editingConnId) {
      await updateDBConnection(editingConnId, newConn, password || undefined)
      setIsCreating(false)
      setEditingConnId(null)
    } else {
      const id = await addDBConnection(
        newConn as Omit<DBConnectionConfig, 'id'>,
        password
      )
      setIsCreating(false)
      setSelectedConnId(id)
    }
    setTestSuccess(false)
    setPassword('')
  }

  const getFullId = useCallback((table: { name: string; schema?: string }) => {
    return table.schema ? `${table.schema}.${table.name}` : table.name
  }, [])

  const toggleTable = useCallback(
    (table: { name: string; schema?: string }) => {
      if (!selectedConnId) return
      const fullId = getFullId(table)
      setLocalSelection(prev => {
        const connSelection = { ...(prev[selectedConnId] || {}) }
        if (connSelection[fullId]) {
          delete connSelection[fullId]
        } else {
          connSelection[fullId] = table
        }
        return { ...prev, [selectedConnId]: connSelection }
      })
    },
    [selectedConnId, getFullId]
  )

  const handleConfirm = () => {
    const newTasks: IngestionTask[] = []
    Object.entries(localSelection).forEach(([connId, tableMap]) => {
      const conn = dbConnections.find(c => c.id === connId)
      if (!conn) return
      Object.values(tableMap).forEach(table => {
        const fullId = getFullId(table)
        const exists = tasks.some(
          t => t.connectionId === connId && t.sourceName === fullId
        )
        if (!exists) {
          newTasks.push({
            id: crypto.randomUUID(),
            sourceName: fullId,
            fileName: `${conn.name} (${conn.type})`,
            connectionId: connId,
            originalTableName: table.name,
            dbSchema: table.schema,
            filePath: '',
            tableName: '',
            finalTableName: '',
            finalDisplayName: fullId,
            columns: [],
            previewData: [],
            rowCount: 0,
            mode,
            status: 'waiting_for_sync',
          })
        }
      })
    })
    setTasks([...tasks, ...newTasks])
    setDbSelectorOpen(false)
  }

  const totalSelected = Object.values(localSelection).reduce(
    (acc, map) => acc + Object.keys(map).length,
    0
  )

  return (
    <Dialog open={isDbSelectorOpen} onOpenChange={setDbSelectorOpen}>
      <DialogContent
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
        className="max-w-5xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden shadow-2xl border-none rounded-3xl bg-white"
      >
        <div className="flex h-full min-h-0 text-zinc-900">
          <div className="w-64 border-r border-zinc-100 flex flex-col bg-zinc-50/50 shrink-0">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-white/50">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                {t('connector.saved_connections')}
              </span>
              <button
                onClick={() => {
                  setIsCreating(true)
                  setEditingConnId(null)
                  setSelectedConnId(null)
                  setError(null)
                  setTestSuccess(false)
                }}
                className="p-1.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {dbConnections.map(conn => (
                <div
                  key={conn.id}
                  onClick={async () => {
                    // Check password before selecting
                    const pwdRes = await window.electronAPI.secureGet(`db_pass_${conn.id}`)
                    if (!pwdRes.data) {
                      setEditingConnId(conn.id)
                      setIsCreating(true)
                      setSelectedConnId(conn.id)
                      setError(t('connector.error_password_missing'))
                    } else {
                      setSelectedConnId(conn.id)
                      setIsCreating(false)
                      setEditingConnId(null)
                    }
                  }}
                  className={cn(
                    'group flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all border',
                    selectedConnId === conn.id
                      ? 'bg-white border-zinc-200 shadow-sm text-zinc-900 ring-1 ring-zinc-100'
                      : 'border-transparent text-zinc-500 hover:bg-zinc-100'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0',
                        conn.type === 'postgres'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-orange-50 text-orange-600'
                      )}
                    >
                      {conn.type === 'postgres' ? 'PG' : 'MY'}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold truncate leading-tight">
                        {conn.name}
                      </span>
                      <span className="text-[9px] text-zinc-400 font-mono truncate">
                        {conn.host}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setEditingConnId(conn.id)
                        setIsCreating(true)
                        setSelectedConnId(conn.id)
                      }}
                      className="p-1.5 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        removeDBConnection(conn.id)
                      }}
                      className="p-1.5 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0 bg-white relative">
            {isCreating ? (
              <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-right-4">
                <div className="p-8 border-b border-zinc-50 shrink-0">
                  <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">
                    {editingConnId ? t('connector.edit_connection') : t('connector.new_connection')}
                  </h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    {t('connector.landing_desc')}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-8 pb-4 space-y-8">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        {t('connector.form_name')}*
                      </Label>
                      <Input
                        placeholder="e.g. Production DB"
                        value={newConn.name || ''}
                        onChange={e =>
                          setNewConn(p => ({ ...p, name: e.target.value }))
                        }
                        className={cn("rounded-xl border-zinc-100 focus:ring-indigo-500 h-11", !newConn.name && "border-amber-200 focus:border-amber-400")}
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        {t('format')}
                      </Label>
                      <div className="flex bg-zinc-100/50 p-1 rounded-xl h-11">
                        {BUSINESS_TYPES.map(type => (
                          <button
                            key={type.id}
                            onClick={() =>
                              setNewConn(p => ({
                                ...p,
                                type: type.id as any,
                                port: type.id === 'postgres' ? 5432 : 3306,
                              }))
                            }
                            className={cn(
                              'flex-1 flex items-center justify-center rounded-lg text-xs font-bold transition-all',
                              newConn.type === type.id
                                ? 'bg-white shadow-sm text-indigo-600'
                                : 'text-zinc-400 hover:text-zinc-600'
                            )}
                          >
                            {type.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="h-px bg-zinc-100" />
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-3 space-y-3">
                      <Label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        <Globe className="w-3 h-3" /> {t('connector.form_host')}*
                      </Label>
                      <Input
                        placeholder="localhost"
                        value={newConn.host || ''}
                        onChange={e =>
                          setNewConn(p => ({ ...p, host: e.target.value }))
                        }
                        className={cn("rounded-xl border-zinc-100 h-11", !newConn.host && "border-amber-200 focus:border-amber-400")}
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        {t('connector.form_port')}*
                      </Label>
                      <Input
                        placeholder="5432"
                        type="number"
                        value={newConn.port || ''}
                        onChange={e =>
                          setNewConn(p => ({
                            ...p,
                            port: parseInt(e.target.value),
                          }))
                        }
                        className={cn("rounded-xl border-zinc-100 h-11", !newConn.port && "border-amber-200 focus:border-amber-400")}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <Label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        <Database className="w-3 h-3" />{' '}
                        {t('connector.form_db')}*
                      </Label>
                      <Input
                        value={newConn.database || ''}
                        onChange={e =>
                          setNewConn(p => ({ ...p, database: e.target.value }))
                        }
                        className={cn("rounded-xl border-zinc-100 h-11", !newConn.database && "border-amber-200 focus:border-amber-400")}
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        <Settings2 className="w-3 h-3" />{' '}
                        {t('connector.form_user')}*
                      </Label>
                      <Input
                        value={newConn.user || ''}
                        onChange={e =>
                          setNewConn(p => ({ ...p, user: e.target.value }))
                        }
                        className={cn("rounded-xl border-zinc-100 h-11", !newConn.user && "border-amber-200 focus:border-amber-400")}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      <ShieldCheck className="w-3 h-3" />{' '}
                      {t('connector.form_pass')}
                    </Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="rounded-xl border-zinc-100 h-11"
                    />
                  </div>

                  {/* Advanced Options */}
                  <div className="space-y-4 pt-4 border-t border-zinc-50">
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-indigo-600 transition-colors"
                    >
                      {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {t('connector.advanced_options')}
                    </button>

                    {showAdvanced && (
                      <div className="p-6 rounded-3xl bg-zinc-50/50 border border-zinc-100 space-y-6 animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="ssl-toggle-dialog"
                            checked={newConn.ssl || false}
                            onChange={e => setNewConn(p => ({ ...p, ssl: e.target.checked }))}
                            className="w-4 h-4 rounded-md border-zinc-300 text-indigo-600 focus:ring-indigo-500 transition-all"
                          />
                          <label htmlFor="ssl-toggle-dialog" className="text-xs font-bold text-zinc-700 cursor-pointer select-none">
                            {t('connector.form_ssl')}
                          </label>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            {t('connector.form_params')}
                          </Label>
                          <Input
                            placeholder={t('connector.form_params_placeholder')}
                            value={newConn.params || ''}
                            onChange={e => setNewConn(p => ({ ...p, params: e.target.value }))}
                            className="rounded-xl border-zinc-100 h-11 bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-8 border-t border-zinc-50 flex items-center justify-between shrink-0 gap-4">
                  <div className="flex-1 min-w-0">
                    {testSuccess && (
                      <div className="flex items-center gap-2 text-emerald-600 animate-in fade-in slide-in-from-bottom-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                        <span className="text-xs font-bold truncate">
                          {t('settings_verify_connected')}
                        </span>
                      </div>
                    )}
                    {error && (
                      <div className="flex items-center gap-2 text-red-600 animate-in fade-in slide-in-from-bottom-2">
                         <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <AlertCircle className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                        <span className="text-xs font-bold truncate" title={error}>
                          {error}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 shrink-0">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsCreating(false)
                      setEditingConnId(null)
                    }}
                    className="rounded-xl h-12 px-6 font-bold text-zinc-500 hover:bg-zinc-100"
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isTesting || !isFormValid}
                    className="rounded-xl h-12 px-6 font-bold border-zinc-200"
                  >
                    {isTesting ? (
                      <Loader2 className="animate-spin w-4 h-4 mr-2" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}{' '}
                    {t('connector.btn_test')}
                  </Button>
                  <Button
                    onClick={handleSaveConnection}
                    disabled={!isFormValid}
                    className="bg-indigo-600 text-white rounded-xl h-12 px-10 font-bold shadow-lg shadow-indigo-100 disabled:opacity-50"
                  >
                    {editingConnId ? t('connector.btn_update') : t('confirm')}
                  </Button>
                </div>
              </div>
            </div>
          ) : selectedConn ? (
              <div className="flex-1 flex flex-col min-h-0 animate-in fade-in">
                <div className="p-6 border-b border-zinc-100 flex justify-between items-center pr-16 bg-white shrink-0 z-30">
                  <div className="flex flex-col">
                    <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
                      {selectedConn.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-black uppercase text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded tracking-widest">
                        {selectedConn.type}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {selectedConn.host}:{selectedConn.port}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <Input
                        placeholder={t('connector.search_tables', {
                          count: filteredAndSortedTables.length,
                        })}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 h-10 w-56 rounded-xl border-zinc-100 text-xs shadow-sm"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchTables(selectedConn.id)}
                      disabled={isLoadingTables}
                      className="rounded-xl border-zinc-200 font-bold h-10"
                    >
                      <RefreshCw
                        className={cn(
                          'w-3.5 h-3.5 mr-2',
                          isLoadingTables && 'animate-spin'
                        )}
                      />{' '}
                      {t('rerun')}
                    </Button>
                  </div>
                </div>

                <div 
                  className="flex-1 overflow-y-auto bg-white scroll-smooth pb-12"
                  onScroll={handleScroll}
                >
                  {isLoadingTables ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4 py-32">
                      <div className="relative">
                        <Loader2 className="w-12 h-12 animate-spin text-indigo-600 opacity-20" />
                        <Database className="w-5 h-5 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-40" />
                      </div>
                      <span className="text-sm font-bold text-zinc-400 italic animate-pulse">
                        {t('connector.fetching_schema')}
                      </span>
                    </div>
                  ) : error ? (
                    <div className="py-32 text-center flex flex-col items-center">
                      <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                      </div>
                      <p className="text-red-600 font-bold max-w-md px-8">{error}</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => fetchTables(selectedConnId!)}
                        className="mt-4 rounded-xl border-zinc-200"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-2" /> {t('connector.btn_refresh')}
                      </Button>
                    </div>
                  ) : filteredAndSortedTables.length === 0 ? (
                    <div className="py-32 text-center flex flex-col items-center">
                      <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-zinc-200" />
                      </div>
                      <p className="text-zinc-400 font-bold">
                        {searchQuery ? t('connector.no_tables_match') : t('connector.no_tables_match')}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {renderData.items.map(table => {
                          const fullId = getFullId(table)
                          const isSelected =
                            !!localSelection[selectedConnId!]?.[fullId]
                          const isAlreadyInTasks = tasks.some(
                            t =>
                              t.connectionId === selectedConnId &&
                              t.sourceName === fullId
                          )
                          return (
                            <TableItemCard
                              key={fullId}
                              name={table.name}
                              schema={table.schema}
                              fullId={fullId}
                              isSelected={!!isSelected}
                              isAlreadyInTasks={isAlreadyInTasks}
                              onToggle={toggleTable}
                            />
                          )
                        })}
                      </div>
                      {renderData.hasMore && (
                        <div className="py-8 text-center flex items-center justify-center gap-2 text-zinc-400 animate-in fade-in">
                           <Loader2 className="w-4 h-4 animate-spin" />
                           <span className="text-xs font-bold">{t('connector.loading_more')}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 animate-in fade-in duration-700">
                <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mb-6">
                  <Server className="w-8 h-8 opacity-20" />
                </div>
                <p className="text-sm font-bold uppercase tracking-widest opacity-40">
                  {t('connector.no_connections')}
                </p>
              </div>
            )}
          </div>
        </div>

        {!isCreating && (
          <div className="p-6 border-t border-zinc-100 bg-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-2.5 h-2.5 rounded-full',
                  totalSelected > 0
                    ? 'bg-indigo-600 animate-pulse'
                    : 'bg-zinc-200'
                )}
              />
              <span className="text-sm font-black text-zinc-900">
                {totalSelected}{' '}
                <span className="text-zinc-400 font-bold text-xs uppercase ml-1">
                  {t('connector.selected_tables', { count: totalSelected })}
                </span>
              </span>
            </div>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setDbSelectorOpen(false)}
                className="rounded-xl font-bold px-6"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={totalSelected === 0}
                className="bg-zinc-900 hover:bg-black text-white rounded-xl px-10 font-bold shadow-xl shadow-zinc-100 transition-all disabled:opacity-30 h-12"
              >
                {t('confirm')} ({totalSelected})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
