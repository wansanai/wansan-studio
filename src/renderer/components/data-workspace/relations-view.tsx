import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileNode, TableRelation } from '@shared/types'
import { Button } from '../ui/button'
import { Link2, ArrowRightLeft, Edit2, Trash2, Plus } from 'lucide-react'
import { useProjectStore } from '@/stores/useProjectStore'
import { useToastStore } from '@/stores/useToastStore'
import { RelationEditorModal } from '../modals/RelationEditorModal'

interface RelationsViewProps {
  file: FileNode
}

export function RelationsView({ file }: RelationsViewProps) {
  const { t } = useTranslation('common')
  const toast = useToastStore()
  
  const files = useProjectStore(s => s.files)
  const addRelation = useProjectStore(s => s.addRelation)
  const removeRelation = useProjectStore(s => s.removeRelation)

  const [isRelationModalOpen, setIsRelationModalOpen] = useState(false)
  const [editingRelation, setEditingRelation] = useState<TableRelation | undefined>(
    undefined
  )

  const handleSaveRelation = async (relation: TableRelation) => {
    if (editingRelation) await removeRelation(editingRelation.id)
    await addRelation({ ...relation, sourceFileId: file.id })
    toast.addToast({
      title: editingRelation
        ? t('relationship_updated')
        : t('relationship_added'),
      type: 'success',
    })
  }
  
  const handleEditRelation = (rel: TableRelation) => {
    setEditingRelation(rel)
    setIsRelationModalOpen(true)
  }
  
  const handleDeleteRelation = async (relId: string) => {
    await removeRelation(relId)
    toast.addToast({ title: t('relationship_removed'), type: 'success' })
  }

  return (
    <>
      <div className="flex flex-col h-full bg-transparent relative p-6 overflow-y-auto">
        <div className="grid grid-cols-1 gap-4 max-w-4xl mx-auto w-full">
          {(file.relations || []).map(rel => (
            <div
              key={rel.id}
              className="p-5 bg-white/80 dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 rounded-3xl flex items-center justify-between group hover:border-zinc-200 dark:hover:border-zinc-700 transition-all shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-2xl text-pink-600 dark:text-pink-400">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {rel.sourceColumn}
                    </span>
                    <ArrowRightLeft className="w-3 h-3 text-zinc-300 dark:text-zinc-600" />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {files.find(f => f.id === rel.targetFileId)?.name}.
                      {rel.targetColumn}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 uppercase tracking-widest font-black">
                    {rel.joinType || 'LEFT'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEditRelation(rel)}
                  className="h-9 w-9 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteRelation(rel.id)}
                  className="h-9 w-9 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() => {
              setEditingRelation(undefined)
              setIsRelationModalOpen(true)
            }}
            className="h-20 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl hover:border-pink-300 dark:hover:border-pink-700 hover:bg-pink-50/20 dark:hover:bg-pink-900/10 text-zinc-400 hover:text-pink-600 dark:hover:text-pink-400 transition-all flex flex-col gap-1"
          >
            <Plus className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-widest">
              {t('add_relationship')}
            </span>
          </Button>
        </div>
      </div>

      <RelationEditorModal
        isOpen={isRelationModalOpen}
        onClose={() => setIsRelationModalOpen(false)}
        onSave={handleSaveRelation}
        initialRelation={editingRelation}
        sourceFile={file}
        allFiles={files}
      />
    </>
  )
}
