import React, { useRef, useEffect } from 'react'
import { GenUIPayload } from '@shared/schemas/gen-ui'
import * as echarts from 'echarts'

interface ShadowWidgetProps {
  payload: GenUIPayload
  width: number | string
  height: number | string
  data?: any
}

const ShadowWidget: React.FC<ShadowWidgetProps> = ({ payload, width, height, data }) => {
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

    const cleanup = () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      chartInstancesRef.current.forEach(inst => inst.dispose())
      chartInstancesRef.current = []
      observersRef.current.forEach(obs => obs.disconnect())
      observersRef.current = []
    }
    cleanup()

    // 1. Reset structure
    shadow.innerHTML = ''
    
    // 2. Styles
    const style = document.createElement('style')
    style.textContent = `
      :host { display: block; width: 100%; height: 100%; }
      #chart-container { 
        min-height: 250px; 
        width: 100%; 
        display: block !important;
        background: rgba(0,0,0,0.02);
      }
      @import "https://cdn.tailwindcss.com";
    `
    shadow.appendChild(style)

    // 3. HTML
    const contentWrapper = document.createElement('div')
    contentWrapper.style.width = '100%'
    contentWrapper.style.height = '100%'
    contentWrapper.innerHTML = payload.html
    shadow.appendChild(contentWrapper)

    // 4. Sandbox Execution
    rafIdRef.current = requestAnimationFrame(() => {
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
          
          const createIcons = () => {
            if ((window as any).lucide) {
              (window as any).lucide.createIcons({ root: shadow })
            }
          }

          const env = { 
            echarts: trackedEcharts, 
            ResizeObserver: TrackedResizeObserver,
            createIcons 
          }

          const proxyWindow = new Proxy(window, {
            get(target, prop) {
              if (prop === 'echarts') return trackedEcharts
              if (prop === 'data') return data
              return (target as any)[prop]
            }
          })
          
          const renderFunc = new Function(
            'root', 
            '__inputData__', 
            'env', 
            'echarts', 
            'ResizeObserver', 
            'createIcons', 
            'window',
            payload.js
          )
          
          renderFunc(shadow, data, env, trackedEcharts, TrackedResizeObserver, createIcons, proxyWindow)
          createIcons()
          
        } catch (err: any) {
          console.error('[ShadowWidget] Runtime Error:', err)
        }
      })
    })

    return cleanup
  }, [payload, data, width, height])

  return (
    <div 
      ref={containerRef} 
      style={{ width: width || '100%', height: height || '100%' }}
      className="wansan-shadow-widget-container" 
    />
  )
}

export default ShadowWidget