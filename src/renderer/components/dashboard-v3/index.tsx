import React, { useCallback, useEffect, useRef, useState } from 'react'

import {
  PAGE_GAP_PX,
  PAGE_HEIGHT_PX,
  PAGE_WIDTH_PX,
  PageLayer,
  SCREEN_WIDTH_PX,
} from './page-layer'
import { GridLayer } from './grid-layer'
import { ReportFlowLayer } from './report-flow-layer' // Added
import { LayoutScenario, useWorkbenchStore } from '@/stores/useWorkbenchStore'
import { useUIStore } from '@/stores/useUIStore'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { cn } from '@/utils/cn'

export function DashboardCanvasV3({
  isPresentationMode,
}: {
  isPresentationMode: boolean
}) {
  // const { t } = useTranslation('common')
  const canvasConfig = useWorkbenchStore(state => state.canvasConfig)
  const setCanvasConfig = useWorkbenchStore(state => state.setCanvasConfig)
  const layoutScenario = useWorkbenchStore(state => state.layoutScenario)
  const setLayoutScenario = useWorkbenchStore(state => state.setLayoutScenario)
  const pageCount = useWorkbenchStore(state => state.pageCount)
  // const pinnedReports = useWorkbenchStore(state => state.pinnedReports)
  const analysisSplit = useUIStore(s => s.analysisSplit)
  const sidebarWidth = useUIStore(s => s.sidebarWidth)

  const { zoom, layout } = canvasConfig
  const isA4 = layout === 'a4'
  const containerRef = useRef<HTMLDivElement>(null)

  // Gesture State
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [scrollStart, setScrollStart] = useState({ left: 0, top: 0 })

  // --- Auto-centering Logic ---
  const centerCanvas = useCallback((smooth = true) => {
    // Use timeout to ensure DOM has updated after layout/zoom changes
    setTimeout(() => {
      if (containerRef.current) {
        const container = containerRef.current
        const centerScrollX =
          (container.scrollWidth - container.clientWidth) / 2
        container.scrollTo({
          left: Math.max(0, centerScrollX),
          behavior: smooth ? 'smooth' : 'auto',
        })
      }
    }, 50)
  }, [])

  useEffect(() => {
    const target: LayoutScenario = isA4 ? 'print' : 'default'
    if (layoutScenario !== target) {
      setLayoutScenario(target)
    }

    centerCanvas()
  }, [isA4, layoutScenario, setLayoutScenario, centerCanvas])

  // Center when zoom or panel layout changes
  useEffect(() => {
    centerCanvas(true)
  }, [zoom, analysisSplit, sidebarWidth, centerCanvas])

  // Center on window resize
  useEffect(() => {
    const handleResize = () => centerCanvas(false)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [centerCanvas])

  // --- Zoom Logic (Ctrl + Wheel) ---
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaY
        // Zoom step: 5% per tick
        const step = 5
        const direction = delta > 0 ? -1 : 1
        const nextZoom = Math.min(Math.max(zoom + step * direction, 10), 400)

        if (nextZoom !== zoom) {
          setCanvasConfig({ zoom: nextZoom })
        }
      }
    }

    // Passive: false is required to prevent default browser zoom
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [zoom, setCanvasConfig])

  // --- Space Key Logic ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if the target is an editable element
      const target = e.target as HTMLElement
      const isEditable =
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        // Check for specific Monaco Editor class if needed, but isContentEditable usually covers it
        target.classList.contains('monaco-editor') ||
        target.closest('.monaco-editor') !== null

      if (e.code === 'Space' && !e.repeat && !isEditable) {
        e.preventDefault() // Prevent page scroll
        setIsSpacePressed(true)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false)
        setIsDragging(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // --- Pan Logic ---
  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle Mouse (button 1) OR (Left Mouse (button 0) + Space)
    if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
      e.preventDefault()
      setIsDragging(true)
      setDragStart({ x: e.clientX, y: e.clientY })
      if (containerRef.current) {
        setScrollStart({
          left: containerRef.current.scrollLeft,
          top: containerRef.current.scrollTop,
        })
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return

    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y

    containerRef.current.scrollLeft = scrollStart.left - dx
    containerRef.current.scrollTop = scrollStart.top - dy
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const totalHeightPx =
    pageCount > 0
      ? pageCount * PAGE_HEIGHT_PX + Math.max(0, pageCount - 1) * PAGE_GAP_PX
      : undefined

  const gridWidth = isA4 ? PAGE_WIDTH_PX : SCREEN_WIDTH_PX
  const isReportMode = canvasConfig.layout === 'report'
  // Allow zooming in dashboard/a4 modes, but force 1.0 in Presentation or Report Mode
  const activeScale = isPresentationMode ? 1.0 : zoom / 100

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {!isPresentationMode && (
        <div className="draggable shrink-0 border-b bg-white/50 backdrop-blur z-10">
          <div className="non-draggable">
            <DashboardHeader />
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className={cn(
          'flex w-full flex-1 overflow-auto bg-zinc-100/60 dark:bg-zinc-900',
          isReportMode ? 'p-0' : 'p-6',
          !isReportMode &&
            isSpacePressed &&
            (isDragging ? 'cursor-grabbing' : 'cursor-grab')
        )}
        onMouseDown={e => !isReportMode && handleMouseDown(e)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className={cn(
            'flex min-h-min flex-col',
            isReportMode ? 'w-full' : 'mx-auto w-fit',
            isA4 && !isReportMode ? 'items-center' : ''
          )}
        >
          <div
            id="dashboard-export-root"
            className={`relative w-full transition-transform duration-200 ${
              !isA4 && !isReportMode ? 'bg-white shadow-sm' : ''
            }`}
            style={
              isReportMode
                ? { width: '100%', minHeight: '100vh' }
                : {
                    transform: `scale(${activeScale})`,
                    transformOrigin: 'top center',
                    width: `${gridWidth}px`,
                    minHeight: isA4
                      ? `${totalHeightPx ?? PAGE_HEIGHT_PX}px`
                      : '100vh',
                  }
            }
          >
            {isReportMode ? (
              <ReportFlowLayer width={gridWidth} scale={activeScale} readOnly={isPresentationMode} />
            ) : (
              <>
                <PageLayer isA4={isA4} pageCount={pageCount} />
                <GridLayer
                  width={gridWidth}
                  isA4={isA4}
                  height={isA4 ? totalHeightPx : undefined}
                  scale={activeScale}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
