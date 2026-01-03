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

    const cleanup = () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      chartInstancesRef.current.forEach(inst => inst.dispose())
      chartInstancesRef.current = []
      observersRef.current.forEach(obs => obs.disconnect())
      observersRef.current = []
      // 清理全局变量，防止污染
      if ((window as any).__WANSAN_DATA__) delete (window as any).__WANSAN_DATA__
    }
    cleanup()

    shadow.innerHTML = ''

    // 1. 注入强制样式
    const style = document.createElement('style')
    style.textContent = `
      :host { display: block; width: 100%; }
      #chart-container { min-height: 200px; width: 100%; display: block; }
    `
    shadow.appendChild(style)

    // 2. 注入库
    const injectLib = (src: string, id: string) => {
      const s = document.createElement('script')
      s.src = src; s.id = id; s.async = false
      shadow.appendChild(s)
    }
    injectLib('https://cdn.tailwindcss.com', 'tw-cdn')
    injectLib('https://unpkg.com/lucide@latest', 'lucide-cdn')
    
    // 3. 注入 HTML
    const contentWrapper = document.createElement('div')
    contentWrapper.style.width = '100%'
    contentWrapper.innerHTML = spec.html
    shadow.appendChild(contentWrapper)

    // 4. 执行逻辑
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

          // 将数据挂载到全局，方便 AI 访问 (兼容 window.data 的写法)
          ;(window as any).__WANSAN_DATA__ = spec.data
          // 在沙箱内提供 data 变量名，但使用 arguments 访问以避免声明冲突
          const env = { echarts: trackedEcharts }
          
          // 我们不再在参数列表中使用 'data' 这个名字
          const renderFunc = new Function(
            'root', 
            '__inputData__', 
            'echarts', 
            'ResizeObserver', 
            'env', 
            'createIcons', 
            spec.js
          )
          
          // 执行。如果 AI 代码里写了 const data = ..., 它会正常声明局部变量。
          // 如果它没写直接用 data, 我们在 Prompt 里告诉它 data 等于 __inputData__。
          renderFunc(shadow, spec.data, trackedEcharts, TrackedResizeObserver, env, createIcons)
          createIcons()
          
        } catch (err: any) {
          console.error('ShadowWidget Execution Error:', err)
        }
      })
    })

    return cleanup
  }, [spec])

  return <div ref={containerRef} className={className} />
}

export default ShadowWidget