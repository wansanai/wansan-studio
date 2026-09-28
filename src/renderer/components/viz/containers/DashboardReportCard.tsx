import React, { forwardRef, useRef, useState } from 'react'
import { VizRenderer } from '../core/VizRenderer'
import { TitleWidget } from '../base/TitleWidget'
import {
  X,
  GripHorizontal,
  MoreVertical,
  FileImage,
} from 'lucide-react'
import { toPng } from 'html-to-image'
import { useToastStore } from '../../../stores/useToastStore'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'

interface DashboardReportCardProps {
  report: any
  onRemove: () => void
  style?: React.CSSProperties
  className?: string
  variant?: 'dashboard' | 'chat' | 'report'
  onMouseDown?: React.MouseEventHandler
  onMouseUp?: React.MouseEventHandler
  onTouchEnd?: React.TouchEventHandler
}

export const DashboardReportCard = forwardRef<
  HTMLDivElement,
  DashboardReportCardProps
>(
  (
    {
      report,
      onRemove,
      style,
      className,
      variant = 'dashboard',
      ...props
    },
    ref
  ) => {
    const cardRef = useRef<HTMLDivElement>(null)
    const [showMenu, setShowMenu] = useState(false)
    const { t } = useTranslation('common')
    const addToast = useToastStore(state => state.addToast)
    const isDashboard = variant === 'dashboard'
    const isReport = variant === 'report'
    const isTextWidget = report.reportData.chartType === 'text'

    // Merge refs
    React.useImperativeHandle(ref, () => cardRef.current!)

    const handleExportImage = async () => {
      if (!cardRef.current) return
      setShowMenu(false)

      try {
        const dataUrl = await toPng(cardRef.current, {
          backgroundColor: isTextWidget ? undefined : '#ffffff',
          filter: node => {
            // Exclude controls from the screenshot
            return (
              !node.classList?.contains('card-controls') &&
              !node.classList?.contains('hide-on-export')
            )
          },
        })

        const result = await window.electronAPI.saveImage({
          dataUrl,
          name: `${report.reportData.title || 'report'}.png`
        })

        if (result.success) {
          addToast({
            title: t('image_saved'),
            description: t('image_saved_desc'),
            type: 'success',
          })
        } else if (result.error !== 'Cancelled') {
          throw new Error(result.error)
        }
      } catch (error) {
        console.error('Export failed', error)
        addToast({
          title: t('export_failed_title'),
          description: String(error),
          type: 'error',
        })
      }
    }

    return (
      <div
        ref={cardRef}
        style={style}
        data-export-id={report.id}
        className={cn(
          'group relative flex flex-col overflow-hidden transition-all no-break',
          isDashboard
            ? isTextWidget
              ? 'h-full w-full'
              : 'h-full w-full bg-white border border-zinc-200 shadow-md rounded-lg hover:shadow-lg'
            : isReport
              ? isTextWidget
                ? 'w-full mb-6'
                : 'w-full bg-white border border-zinc-100 border-l-4 border-l-indigo-500 shadow-sm rounded-r-lg mb-8'
              : 'w-full max-w-3xl bg-white border border-zinc-200 shadow-md rounded-lg hover:shadow-lg',
          className
        )}
        {...props}
      >
        {/* Controls */}
        {!isReport && (
          <div
            className={cn(
              'absolute top-2 right-2 transition-opacity z-30 flex gap-2 card-controls opacity-0 group-hover:opacity-100'
            )}
          >
            {isDashboard && (
              <button
                type="button"
                className="drag-handle flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-zinc-200 bg-white/90 text-zinc-400 shadow-sm transition hover:text-zinc-600 cursor-grab active:cursor-grabbing"
                title={t('drag_rearrange')}
              >
                <GripHorizontal className="w-4 h-4" />
              </button>
            )}
            {!isTextWidget && (
              <div className="relative">
                <button
                  onClick={e => {
                    e.stopPropagation()
                    setShowMenu(!showMenu)
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  className="p-1.5 bg-white text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-md border border-zinc-200 shadow-sm transition-colors cursor-pointer"
                  title={t('more_options')}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={e => {
                        e.stopPropagation()
                        setShowMenu(false)
                      }}
                    />
                    <div className="absolute right-0 mt-2 w-36 bg-white rounded-md shadow-lg border border-zinc-200 py-1 z-50">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          handleExportImage()
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                      >
                        <FileImage className="w-4 h-4" />
                        {t('export_png')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={e => {
                e.stopPropagation()
                window.dispatchEvent(new Event('wansan:open-dashboard'))
                onRemove()
              }}
              onMouseDown={e => e.stopPropagation()}
              className="p-1.5 bg-white text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md border border-zinc-200 shadow-sm transition-colors cursor-pointer"
              title={t('remove_from_dashboard')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div
          className={cn(
            'flex-1 min-h-0 w-full flex flex-col',
            !isTextWidget && 'pt-4'
          )}
        >
          {isTextWidget ? (
            <TitleWidget
              id={report.id}
              content={report.reportData.content || ''}
            />
          ) : (
            <VizRenderer
              {...report.reportData}
              variant={isReport ? 'report' : 'dashboard'}
              timestamp={report.reportData.timestamp}
              className="flex-1 min-h-0 w-full p-4"
            />
          )}
        </div>
      </div>
    )
  }
)

DashboardReportCard.displayName = 'DashboardReportCard'
