import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileNode, SmartMetric } from '@shared/types'
import { Button } from '../ui/button'
import { Tag, Edit2, Trash2, Plus } from 'lucide-react'
import { useProjectStore } from '@/stores/useProjectStore'
import { useToastStore } from '@/stores/useToastStore'
import { MetricEditorModal } from '../modals/metric-editor-modal'

interface MetricsViewProps {
  file: FileNode
}

export function MetricsView({ file }: MetricsViewProps) {
  const { t } = useTranslation('common')
  const toast = useToastStore()
  
  const addSmartMetric = useProjectStore(s => s.addSmartMetric)
  const removeSmartMetric = useProjectStore(s => s.removeSmartMetric)

  const [isMetricModalOpen, setIsMetricModalOpen] = useState(false)
  const [editingMetric, setEditingMetric] = useState<SmartMetric | undefined>(
    undefined
  )

  const handleAddMetric = () => {
    setEditingMetric(undefined)
    setIsMetricModalOpen(true)
  }
  
  const handleEditMetric = (metric: SmartMetric) => {
    setEditingMetric(metric)
    setIsMetricModalOpen(true)
  }
  
  const handleSaveMetric = async (metric: Omit<SmartMetric, 'id'>) => {
    if (editingMetric) await removeSmartMetric(file.id, editingMetric.id)
    const newMetric: SmartMetric = {
      ...metric,
      id: editingMetric ? editingMetric.id : crypto.randomUUID(),
    }
    await addSmartMetric(file.id, newMetric)
    setIsMetricModalOpen(false)
    toast.addToast({
      title: editingMetric ? t('metric_updated') : t('metric_added'),
      type: 'success',
    })
  }

  return (
    <>
      <div className="flex flex-col h-full bg-transparent relative p-6 overflow-y-auto">
        <div className="grid grid-cols-1 gap-4 max-w-4xl mx-auto w-full">
          {(file.smartMetrics || []).map(metric => (
            <div
              key={metric.id}
              className="p-5 bg-white/80 dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-3xl flex items-center justify-between group hover:border-zinc-200 dark:hover:border-zinc-700 transition-all shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-2xl text-purple-600 dark:text-purple-400">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {metric.name}
                  </h4>
                  <code className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 block bg-zinc-100/50 dark:bg-zinc-800 px-1.5 py-0.5 rounded w-fit font-mono">
                    {metric.sqlExpression}
                  </code>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEditMetric(metric)}
                  className="h-9 w-9 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    removeSmartMetric(file.id, metric.id)
                  }
                  className="h-9 w-9 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={handleAddMetric}
            className="h-20 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/20 dark:hover:bg-indigo-900/10 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex flex-col gap-1"
          >
            <Plus className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-widest">
              {t('add_metric')}
            </span>
          </Button>
        </div>
      </div>

      <MetricEditorModal
        isOpen={isMetricModalOpen}
        onClose={() => setIsMetricModalOpen(false)}
        onSave={handleSaveMetric}
        initialMetric={editingMetric}
        file={file}
      />
    </>
  )
}
