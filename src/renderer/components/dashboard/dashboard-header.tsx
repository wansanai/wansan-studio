/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Lock,
  Minus,
  Monitor,
  Plus,
  Printer,
  Type,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CanvasLayout, useWorkbenchStore } from '@/stores/useWorkbenchStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useToastStore } from '@/stores/useToastStore'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { useTranslation } from 'react-i18next'
import { Analytics } from '../../services/analytics'
import logo from '@/src/assets/logo.png'
import { useExportWebReport } from '@/hooks/useIPC'
import { collectExcelDataFromDashboard } from '@/utils/export-utils'
import { ExportLoadingModal } from '../modals/ExportLoadingModal'
import { useProGate } from '@/hooks/use-pro-gate'
import { sanitizeFilename } from '@shared/naming-utils'

export function DashboardHeader() {
  const { setCanvasConfig, setLayoutScenario } = useWorkbenchStore()
  const canvasConfig = useWorkbenchStore(state => state.canvasConfig)
  const pageCount = useWorkbenchStore(state => state.pageCount)
  const setPageCount = useWorkbenchStore(state => state.setPageCount)
  // const layoutScenario = useWorkbenchStore(state => state.layoutScenario)
  const isA4 = canvasConfig.layout === 'a4'
  const isReport = canvasConfig.layout === 'report'
  const { t } = useTranslation('common')
  const { isActivated, language } = useSettingsStore()
  const addToast = useToastStore(state => state.addToast)
  const addWidget = useProjectStore(state => state.addWidget)
  const { mutateAsync: exportWebReport } = useExportWebReport()
  const [isExporting, setIsExporting] = useState(false)
  const { checkGate, gateNode } = useProGate()

  const handleExportWeb = async () => {
    const { pinnedReports, canvasConfig: _canvasConfig } = useWorkbenchStore.getState()
    const activeSession = useProjectStore.getState().sessions.find(
      s => s.id === useProjectStore.getState().activeSessionId
    )
    const sessionTitle = sanitizeFilename(activeSession?.title, canvasConfig.title || t('default_report_title'))

    // 1. Check if in Report Mode
    if (!isReport) {
      addToast({
        title: t('warning'),
        description: t('export_web_report_hint', 'Web Export is only available in Report Mode. Please switch view first.'),
        type: 'warning',
      })
      return
    }

    Analytics.track('export_clicked', { format: 'html' })
    setIsExporting(true)
    try {
      const filePath = await exportWebReport({
        widgets: pinnedReports,
        config: {
          title: sessionTitle,
          theme: 'minimal',
          language: language as 'en' | 'zh',
        },
        fullSnapshot: {
          workbench: { canvasConfig: { ...canvasConfig, title: sessionTitle } },
          settings: {
            showChartLabels: useSettingsStore.getState().showChartLabels,
          },
        },
      })
      addToast({
        title: t('web_report_generated'),
        description: filePath,
        type: 'success',
        action: {
          label: t('open_folder'),
          onClick: () => window.electronAPI.showItemInFolder(filePath),
        },
      })
    } catch (e) {
      console.error(e)
      if (String(e).includes('Cancelled')) return
      addToast({ title: t('export_failed', 'Export Failed'), type: 'error' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportExcel = async () => {
    const { pinnedReports } = useWorkbenchStore.getState()
    const activeSession = useProjectStore.getState().sessions.find(
      s => s.id === useProjectStore.getState().activeSessionId
    )
    const sessionTitle = sanitizeFilename(activeSession?.title, 'Dashboard')
    
    Analytics.track('export_clicked', { format: 'excel' })
    setIsExporting(true)
    
    try {
      addToast({
        title: t('export_generating_file'),
        description: t('exporting_excel'),
        type: 'info',
        duration: 2000,
      })

      const insightLabels = {
        summary: t('insight_summary'),
        findings: t('insight_findings'),
        recommendation: t('insight_recommendation')
      }

      const sheets = await collectExcelDataFromDashboard(pinnedReports, insightLabels)
      if (sheets.length === 0) {
        addToast({ title: t('no_chart_data'), type: 'warning' })
        return
      }

      const fileName = `${sessionTitle}_Export_${new Date().toISOString().slice(0, 10)}.xlsx`
      const result = await window.electronAPI.exportExcel({
        filename: fileName,
        sheets,
        insightTitle: t('insights')
      })

      if (result.success && result.data) {
        const filePath = result.data as string
        addToast({
          title: t('export_success'),
          description: filePath,
          type: 'success',
          action: {
            label: t('open_folder'),
            onClick: () => window.electronAPI.showItemInFolder(filePath),
          },
        })
      } else if (result.error !== 'Cancelled') {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Excel Export failed', error)
      addToast({
        title: t('export_failed'),
        description: String(error),
        type: 'error',
      })
    } finally {
      setIsExporting(false)
    }
  }

  const insertTextWidget = () => {
    const widgetId = crypto.randomUUID()
    const id = crypto.randomUUID()

    // Intelligent Positioning Logic
    const state = useProjectStore.getState()
    const session = state.sessions.find(s => s.id === state.activeSessionId)
    const widgets = session?.dashboard.widgets || []
    const currentPage = pageCount - 1 // Default to last page

    // Filter widgets on the target page
    const pageWidgets = widgets.filter(w => (w.pageIndex || 0) === currentPage)

    // Find max Y + H on this page
    let maxY = 0
    pageWidgets.forEach(w => {
      const bottom = w.layout.y + w.layout.h
      if (bottom > maxY) maxY = bottom
    })

    let targetY = maxY
    let targetPage = currentPage

    // Check if it fits on this page (A4 Mode Only)
    const WIDGET_HEIGHT = 2
    const MAX_ROWS = 27

    if (isA4 && targetY + WIDGET_HEIGHT > MAX_ROWS) {
      // Move to next page
      targetPage = currentPage + 1
      targetY = 0
      if (targetPage >= pageCount) {
        setPageCount(targetPage + 1)
      }
    }

    addWidget({
      id,
      sourceMessageId: 'manual',
      widgetId,
      reportData: {
        title: t('text_block', 'Text Block'),
        content: t('new_section', 'New Section'),
        chartType: 'text',
        timestamp: Date.now(),
      },
      layout: { i: id, x: 0, y: targetY, w: 12, h: WIDGET_HEIGHT },
      pageIndex: targetPage,
    })
  }

  const updateConfig = (key: keyof typeof canvasConfig, value: unknown) => {
    setCanvasConfig({ [key]: value } as Partial<typeof canvasConfig>)
  }

  const handleLayoutChange = (value: CanvasLayout) => {
    Analytics.track('layout_switched', { mode: value })
    updateConfig('layout', value)
    setLayoutScenario(value === 'a4' ? 'print' : 'default')
  }

  const handleExport = async (type: 'pdf' | 'png' | 'raw' = 'pdf') => {
    if (type === 'raw') {
      // Default to PDF for generic call
      handleExport('pdf')
      return
    }

    const node = document.getElementById('dashboard-export-root')
    if (!node) {
      console.warn('dashboard-export-root not found for export')
      return
    }

    const originalZoom = canvasConfig.zoom
    setCanvasConfig({ zoom: 100 })
    setIsExporting(true)
    node.classList.add('wansan-exporting-pdf')
    await new Promise(resolve => setTimeout(resolve, 500))

    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: el =>
          !el.classList?.contains('card-controls') &&
          !el.classList?.contains('hide-on-export'),
      })

      const logoImg = new Image()
      await new Promise<void>(resolve => {
        logoImg.onload = () => resolve()
        logoImg.onerror = () => resolve()
        logoImg.src = logo
      })

      const activeSession = useProjectStore.getState().sessions.find(
        s => s.id === useProjectStore.getState().activeSessionId
      )
      const sessionTitle = sanitizeFilename(activeSession?.title, canvasConfig.title || 'Report')
      const fileName = `${sessionTitle}.${type === 'png' ? 'png' : 'pdf'}`

      if (type === 'png') {
        Analytics.track('export_clicked', { format: 'png' })

        const img = new Image()
        img.src = dataUrl
        await new Promise(r => {
          img.onload = r
        })

        const logoSize = Math.max(24, img.width * 0.025)
        const fontSize = Math.max(12, img.width * 0.012)
        const footerHeightPx = logoSize * 3

        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height + footerHeightPx
        const ctx = canvas.getContext('2d')

        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0)

          ctx.globalAlpha = 0.6
          const footerY = img.height + footerHeightPx / 2 - logoSize / 2
          const marginX = logoSize
          ctx.drawImage(logoImg, marginX, footerY, logoSize, logoSize)

          const textX = marginX + logoSize + logoSize * 0.5
          const textY = footerY + logoSize / 2
          ctx.font = `500 ${fontSize}px sans-serif`
          ctx.fillStyle = '#71717a'
          ctx.textBaseline = 'middle'
          ctx.fillText('Created with Wansan Studio', textX, textY)
        }

        const result = await window.electronAPI?.saveImage({
          dataUrl: canvas.toDataURL('image/png'),
          name: fileName
        })
        
        if (result.success && result.data) {
          const filePath = result.data as string
          addToast({
            title: t('image_saved', 'Image Saved'),
            description: filePath,
            type: 'success',
            action: {
              label: t('open_folder', 'Open Folder'),
              onClick: () => window.electronAPI.showItemInFolder(filePath),
            },
          })
        }
        return
      }

      if (type === 'pdf') {
        Analytics.track('export_clicked', { format: 'pdf' })
      }

      const img = new Image()
      img.src = dataUrl
      await new Promise(r => {
        img.onload = r
      })

      const pdf = new jsPDF({
        orientation: (isA4 || isReport) ? 'portrait' : 'landscape',
        unit: 'mm',
        format: 'a4',
      })

      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const footerHeightMM = isA4 ? 0 : 8
      const contentHeightMM = pdfHeight - footerHeightMM
      
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('Failed to get 2d context for slicing')
      }

      let currentSourceY = 0
      const totalHeight = img.height
      const ratio = img.width / (node.offsetWidth || 1)
      
      // Collect primary (card) and secondary (sub-widget) boundaries
      const cardElements = Array.from(node.querySelectorAll('.report-card-container'))
      const splitElements = Array.from(node.querySelectorAll('[data-export-split]'))
      
      const boundaries = [
        ...cardElements.map(el => ({
          type: 'card',
          top: (el as HTMLElement).offsetTop * ratio,
          bottom: ((el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight) * ratio
        })),
        ...splitElements.map(el => ({
          type: 'split',
          top: (el as HTMLElement).offsetTop * ratio,
          bottom: ((el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight) * ratio
        }))
      ].sort((a, b) => a.top - b.top)

      let pageIdx = 0
      while (currentSourceY < totalHeight) {
        if (pageIdx > 0) pdf.addPage()
        
        const maxPageHeightInSource = img.width * (contentHeightMM / pdfWidth)
        let actualSliceHeight = maxPageHeightInSource

        if (currentSourceY + maxPageHeightInSource < totalHeight) {
          const cutLine = currentSourceY + maxPageHeightInSource
          
          // 1. Check for card bisection (Primary)
          const bisectedCard = boundaries.find(b => b.type === 'card' && b.top < cutLine && b.bottom > cutLine)
          
          if (bisectedCard) {
            // 2. Check for sub-split within this specific bisected area (Secondary)
            const internalSplit = boundaries.find(b => 
              b.type === 'split' && 
              b.top > bisectedCard.top && 
              b.top < cutLine && 
              b.top > currentSourceY + (maxPageHeightInSource * 0.2) // At least 20% content on current page
            )

            if (internalSplit) {
              // Cut at the sub-split (e.g. between chart and insight)
              actualSliceHeight = internalSplit.top - currentSourceY
            } else if (bisectedCard.top > currentSourceY) {
              // Cut at the card top
              actualSliceHeight = bisectedCard.top - currentSourceY
            }
          }
        }

        canvas.height = actualSliceHeight
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, currentSourceY, img.width, actualSliceHeight, 0, 0, canvas.width, actualSliceHeight)

        const sliceData = canvas.toDataURL('image/png')
        const pdfSliceHeight = (actualSliceHeight / img.width) * pdfWidth
        pdf.addImage(sliceData, 'PNG', 0, 0, pdfWidth, pdfSliceHeight)

        const footerY = pdfHeight - 3
        pdf.addImage(logoImg, 'PNG', 10, footerY - 3, 3, 3)
        pdf.setFontSize(7)
        pdf.setTextColor(120, 120, 120)
        pdf.text('Created with Wansan Studio', 16, footerY - 1)
        pdf.text(`Page ${pageIdx + 1}`, pdfWidth - 10, footerY - 1, { align: 'right' })

        currentSourceY += actualSliceHeight
        pageIdx++

        // Yield to main thread to allow loading animation to run
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Save using Electron API to get file path and show professional toast
      // pdf.output('datauristring') returns "data:application/pdf;filename=...;base64,..."
      const dataUri = pdf.output('datauristring')
      const base64Content = dataUri.split(',')[1] // Strip the data URI prefix

      const result = await window.electronAPI?.saveFile({
        content: base64Content,
        extension: 'pdf',
        name: fileName
      })

      if (result?.success && result.data) {
        const filePath = result.data as string
        addToast({
          title: t('export_success'),
          description: filePath,
          type: 'success',
          action: {
            label: t('open_folder', 'Open Folder'),
            onClick: () => window.electronAPI.showItemInFolder(filePath),
          },
        })
      }
    } catch (err) {
      console.error('Export failed', err)
    } finally {
      node.classList.remove('wansan-exporting-pdf')
      setIsExporting(false)
      setCanvasConfig({ zoom: originalZoom })
    }
  }

  return (
    <div className="h-14 border-b bg-white flex items-center px-4 justify-between shrink-0 z-20 relative">
      {gateNode}
      <ExportLoadingModal isOpen={isExporting} />
      {/* LEFT: Actions */}
      <div className="flex items-center gap-2 w-[200px]">
        <Button
          variant="outline"
          size="sm"
          onClick={insertTextWidget}
          title={t('insert_section', 'New Section')}
          className="h-8 gap-2 bg-white hover:bg-zinc-50 border-zinc-200 shadow-sm"
        >
          <Type className="w-4 h-4 text-zinc-500" />
          <span className="text-zinc-700 text-xs">
            {t('insert_section', 'New Section')}
          </span>
        </Button>
      </div>

      {/* CENTER: View Controls */}
      <div className="flex items-center gap-3">
        {/* Zoom Control (Hide in Report Mode) */}
        {canvasConfig.layout !== 'report' && (
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5 border border-zinc-200 dark:border-zinc-700 h-8">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm hover:bg-white hover:shadow-sm"
              onClick={() =>
                updateConfig('zoom', Math.max(50, canvasConfig.zoom - 10))
              }
            >
              <Minus className="w-3 h-3 text-zinc-600" />
            </Button>
            <span className="text-xs font-medium font-mono w-10 text-center text-zinc-700 dark:text-zinc-300 select-none">
              {Math.round(canvasConfig.zoom)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm hover:bg-white hover:shadow-sm"
              onClick={() =>
                updateConfig('zoom', Math.min(200, canvasConfig.zoom + 10))
              }
            >
              <Plus className="w-3 h-3 text-zinc-600" />
            </Button>
          </div>
        )}

        {/* Page Control (Conditional) */}
        {isA4 && (
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5 border border-zinc-200 dark:border-zinc-700 h-8">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm hover:bg-white hover:shadow-sm"
              disabled={pageCount <= 1}
              onClick={() => setPageCount(Math.max(1, pageCount - 1))}
              title={t('remove_page')}
            >
              <ChevronLeft className="w-3 h-3 text-zinc-600" />
            </Button>
            <span className="text-xs font-medium font-mono w-8 text-center text-zinc-700 dark:text-zinc-300 select-none">
              {pageCount}P
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm hover:bg-white hover:shadow-sm"
              onClick={() => setPageCount(pageCount + 1)}
              title={t('add_page')}
            >
              <ChevronRight className="w-3 h-3 text-zinc-600" />
            </Button>
          </div>
        )}
      </div>

      {/* RIGHT: System & Export */}
      <div className="flex items-center gap-3 w-[240px] justify-end">
        {/* Layout Switcher (Primary Control) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-xs border-zinc-200 shadow-sm"
            >
              {canvasConfig.layout === 'report' ? (
                <FileText className="h-3.5 w-3.5 text-zinc-500" />
              ) : canvasConfig.layout === 'a4' ? (
                <Printer className="h-3.5 w-3.5 text-zinc-500" />
              ) : (
                <Monitor className="h-3.5 w-3.5 text-zinc-500" />
              )}
              <span className="hidden sm:inline">
                {canvasConfig.layout === 'report'
                  ? t('view_report')
                  : canvasConfig.layout === 'a4'
                    ? t('layout_print')
                    : t('layout_screen')}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuRadioGroup
              value={canvasConfig.layout}
              onValueChange={val => handleLayoutChange(val as CanvasLayout)}
            >
              <DropdownMenuRadioItem value="report">
                {t('view_report')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="screen">
                {t('view_dashboard')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="a4">
                {t('layout_print')}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="h-8 gap-2 bg-black hover:bg-zinc-800 text-white shadow-sm"
            >
              {!isActivated ? (
                <Lock className="h-3.5 w-3.5 text-yellow-400" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">{t('export')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={isExporting}
              onSelect={() =>
                checkGate(t('export_pdf'), () => handleExport('pdf'))
              }
            >
              {t('export_pdf')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isExporting}
              onSelect={() =>
                checkGate(t('export_png'), () => handleExport('png'))
              }
            >
              {t('export_png')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isExporting}
              onSelect={() =>
                checkGate(t('export_excel'), handleExportExcel)
              }
            >
              {t('export_excel')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isExporting}
              onSelect={() =>
                checkGate(t('export_web_report'), handleExportWeb)
              }
            >
              {t('export_web_report')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}