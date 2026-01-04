import React, { useRef, useEffect } from 'react'
import { GenUIPayload } from '@shared/schemas/gen-ui'
import * as echarts from 'echarts'

interface ShadowWidgetProps {
  payload: GenUIPayload
  width: number | string
  height: number | string
  data?: any
}

const ShadowWidget: React.FC<ShadowWidgetProps> = ({ payload, width, height, data = [] }) => {
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

    shadow.innerHTML = ''
    
    // Inject Styles
    const style = document.createElement('style')
    style.textContent = 
      '@import "https://cdn.tailwindcss.com";\n' +
      ':host { display: block; width: 100%; height: 100%; font-family: ui-sans-serif, system-ui, sans-serif; }\n' +
      '* { box-sizing: border-box; }\n' +
      '[id*="chart"] { min-height: 250px; width: 100%; display: block !important; }'
    shadow.appendChild(style)

    // Inject HTML
    const contentWrapper = document.createElement('div')
    contentWrapper.style.width = '100%'
    contentWrapper.style.height = '100%'
    contentWrapper.innerHTML = payload.html
    shadow.appendChild(contentWrapper)

    // Execution Sandbox
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = requestAnimationFrame(() => {
        try {
          // --- Prepare Sandbox Context ---
          const trackedEcharts = {
            ...echarts,
            init: (dom: HTMLElement, theme?: string | object, opts?: any) => {
              const inst = echarts.init(dom, theme, opts)
              chartInstancesRef.current.push(inst)
              return inst
            },
          }
          const TrackedResizeObserver = class extends ResizeObserver {
            constructor(callback: ResizeObserverCallback) { super(callback); observersRef.current.push(this) }
          }
          const createIcons = () => { if ((window as any).lucide) (window as any).lucide.createIcons({ root: shadow }) }

          const scope = {
            root: shadow,
            data: data,
            echarts: trackedEcharts,
            ResizeObserver: TrackedResizeObserver,
            createIcons: createIcons,
            console: console,
            // Aliases to handle AI inconsistency
            __inputData__: data,
            __shadowRoot__: shadow,
            document: shadow,
            window: window
          }
          
          // --- Code Sanitization & Execution ---
          // 1. Remove AI's own 'const root = ...' declarations to avoid errors
          let sanitizedJs = payload.js.replace(/^\s*(?:const|let|var)\s+root\s*=.*/gm, '');

          // 2. Wrap sanitized code in a 'with' block for clean scope injection
          const sandboxedCode = `with (scope) { ${sanitizedJs} }`
          
          const renderFunc = new Function('scope', sandboxedCode)
          renderFunc(scope)
          
          createIcons()
          
        } catch (err: any) {
          console.error('[ShadowWidget] Runtime Error:', err)
          const errorBox = document.createElement('div')
          Object.assign(errorBox.style, {
            padding: '1.5rem', margin: '1rem', border: '1px solid #fee2e2',
            backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '0.75rem',
            fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap'
          })
          errorBox.textContent = `[GenUI Error] ${err.message}`
          shadow.innerHTML = ''
          shadow.appendChild(errorBox)
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