import React, { useRef, useEffect } from 'react'
import * as echarts from 'echarts'

export interface GenComponentSpec {
  html: string
  js: string
  data: any
}

interface ShadowWidgetProps {
  spec: GenComponentSpec
  className?: string
}

const ShadowWidget: React.FC<ShadowWidgetProps> = ({ spec, className }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const shadowRootRef = useRef<ShadowRoot | null>(null)
  const chartInstancesRef = useRef<echarts.ECharts[]>([])
  const observersRef = useRef<ResizeObserver[]>([])
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    if (!shadowRootRef.current) {
      shadowRootRef.current = containerRef.current.attachShadow({ mode: 'open' })
    }
    const shadow = shadowRootRef.current

    // --- Cleanup previous state ---
    const cleanup = () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      chartInstancesRef.current.forEach(inst => inst.dispose())
      chartInstancesRef.current = []
      observersRef.current.forEach(obs => obs.disconnect())
      observersRef.current = []
    }
    cleanup()

    shadow.innerHTML = '' // Clear all previous content

    // 1. Inject Libraries (only if not present)
    const injectLib = (src: string, id: string) => {
      if (shadow.getElementById(id)) return
      const s = document.createElement('script')
      s.src = src; s.id = id; s.defer = true
      shadow.appendChild(s)
    }
    injectLib('https://cdn.tailwindcss.com', 'tw-cdn')
    injectLib('https://unpkg.com/lucide@latest', 'lucide-cdn')
    
    // 2. Inject HTML
    const contentWrapper = document.createElement('div')
    contentWrapper.style.width = '100%'
    contentWrapper.innerHTML = spec.html
    shadow.appendChild(contentWrapper)

    // 3. Force height on chart container as a fallback
    const chartContainer = shadow.querySelector('#chart-container') as HTMLElement
    if (chartContainer) {
      if (!chartContainer.style.height && !chartContainer.style.minHeight) {
        chartContainer.style.minHeight = '150px'
      }
    }

    // 4. Execution logic, deferred to the next animation frame
    rafIdRef.current = requestAnimationFrame(() => {
      try {
        const trackedEcharts = {
          ...echarts,
          init: (dom: HTMLElement, theme?: string | object, opts?: any) => {
            const inst = echarts.init(dom, theme, opts)
            chartInstancesRef.current.push(inst)
            return inst
          },
        }

        const TrackedResizeObserver = class extends ResizeObserver {
          constructor(callback: ResizeObserverCallback) {
            super(callback)
            observersRef.current.push(this)
          }
        }
        
        const env = { echarts: trackedEcharts }
        
        const renderFunc = new Function('root', 'data', 'echarts', 'ResizeObserver', 'env', spec.js)
        renderFunc(shadow, spec.data, trackedEcharts, TrackedResizeObserver, env)
        
        if ((window as any).lucide) {
          (window as any).lucide.createIcons({ root: shadow })
        }
      } catch (err: any) {
        console.error('ShadowWidget Execution Error:', err)
        // You might want to display this error inside the shadow DOM
      }
    })

    return cleanup
  }, [spec])

  return <div ref={containerRef} className={className} />
}

export default ShadowWidget
