import React, { useState } from 'react'
import ShadowWidget, { GenComponentSpec } from './ShadowWidget'
import { Loader2, Play, Database, Code } from 'lucide-react'

// --- Mock Data Definitions ---
const MOCK_DATASETS: Record<string, any[]> = {
  sales: [
    { date: 'Mon', value: 150 },
    { date: 'Tue', value: 230 },
    { date: 'Wed', value: 224 },
    { date: 'Thu', value: 218 },
    { date: 'Fri', value: 135 },
    { date: 'Sat', value: 147 },
    { date: 'Sun', value: 260 },
  ],
  growth: [
    { month: 'Jan', users: 1200, growth: 5 },
    { month: 'Feb', users: 1350, growth: 12 },
    { month: 'Mar', users: 1600, growth: 18 },
    { month: 'Apr', users: 2100, growth: 31 },
    { month: 'May', users: 2800, growth: 33 },
  ],
  server: [
    { time: '10:00', cpu: 45, memory: 60 },
    { time: '10:05', cpu: 55, memory: 62 },
    { time: '10:10', cpu: 89, memory: 70 },
    { time: '10:15', cpu: 30, memory: 55 },
    { time: '10:20', cpu: 40, memory: 58 },
  ],
}

// --- Initial Mock Spec (Fallback) ---
const INITIAL_SPEC: GenComponentSpec = {
  html: '<div class="rounded-2xl shadow-sm bg-zinc-50 p-6">\n  <div class="flex justify-between items-center mb-6">\n    <h2 class="text-2xl font-semibold text-zinc-900">用户增长趋势</h2>\n    <div class="text-sm text-zinc-500">面积图</div>\n  </div>\n  <div id="chart-container" class="h-96 w-full rounded-xl bg-white shadow-inner"></div>\n  <div class="mt-4 text-sm text-zinc-600">\n    数据展示每月用户数量变化趋势，使用面积图突出增长幅度。\n  </div>\n</div>',
  js: "const container = root.querySelector('#chart-container');\nif (!container) return;\n\nconst chart = echarts.init(container);\n\nif (!data || !Array.isArray(data) || data.length === 0) {\n  chart.setOption({\n    title: {\n      text: '暂无数据',\n      left: 'center',\n      top: 'center',\n      textStyle: { color: '#9ca3af', fontSize: 16 }\n    }\n  });\n  return;\n}\n\nconst months = data.map(item => item.month).filter(Boolean);\nconst users = data.map(item => item.users).filter(v => typeof v === 'number');\n\nconst option = {\n  tooltip: {\n    trigger: 'axis',\n    backgroundColor: 'rgba(255, 255, 255, 0.95)',\n    borderColor: '#e5e7eb',\n    borderWidth: 1,\n    textStyle: { color: '#374151' },\n    formatter: function(params) {\n      const point = params[0];\n      return `${point.name}<br/>用户数: <b>${point.value}</b>`;\n    }\n  },\n  grid: {\n    left: '3%',\n    right: '4%',\n    bottom: '10%',\n    top: '10%',\n    containLabel: true\n  },\n  xAxis: {\n    type: 'category',\n    boundaryGap: false,\n    data: months,\n    axisLine: { lineStyle: { color: '#d1d5db' } },\n    axisLabel: { color: '#6b7280' }\n  },\n  yAxis: {\n    type: 'value',\n    axisLine: { lineStyle: { color: '#d1d5db' } },\n    axisLabel: { color: '#6b7280' },\n    splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }\n  },\n  series: [\n    {\n      name: '用户数',\n      type: 'line',\n      smooth: true,\n      stack: 'Total',\n      areaStyle: {\n        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [\n          { offset: 0, color: 'rgba(79, 70, 229, 0.4)' },\n          { offset: 1, color: 'rgba(79, 70, 229, 0.05)' }\n        ])\n      },\n      lineStyle: { color: '#4f46e5', width: 3 },\n      itemStyle: { color: '#4f46e5' },\n      emphasis: {\n        focus: 'series',\n        itemStyle: { color: '#3730a3' }\n      },\n      data: users\n    }\n  ]\n};\n\nchart.setOption(option);\n\nconst resizeObserver = new ResizeObserver(() => {\n  chart.resize();\n});\nresizeObserver.observe(container);",
  data: MOCK_DATASETS.growth,
}

const TestPage = () => {
  const [prompt, setPrompt] = useState(
    'A KPI card showing total sales trend with a green badge.'
  )
  const [dataKey, setDataKey] = useState<string>('sales')
  const [spec, setSpec] = useState<GenComponentSpec>(INITIAL_SPEC)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) return

    setIsLoading(true)
    setError(null)
    try {
      if (!window.electronAPI?.generateUI) {
        throw new Error('API not available. Are you in Electron?')
      }

      const currentData = MOCK_DATASETS[dataKey]
      const result = await window.electronAPI.generateUI(prompt, currentData)

      if (result.success && result.data) {
        setSpec({
          html: result.data.spec.html,
          js: result.data.spec.js,
          data: currentData, // Inject current data
        })
      } else {
        throw new Error(result.error || 'Unknown error')
      }
    } catch (err: any) {
      console.error('GenUI Error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-8 bg-zinc-50 min-h-screen font-sans text-zinc-900">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <span className="text-indigo-600">🧬</span> Generative UI Workbench
          </h1>
          <div className="text-xs font-mono text-zinc-400">v1.4 Spike</div>
        </div>

        {/* --- Controls Area --- */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-200 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                User Prompt
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                className="w-full h-24 p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                placeholder="Describe the component..."
              />
            </div>

            <div className="w-64 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Database className="w-3 h-3" /> Data Source
                </label>
                <div className="flex flex-col gap-1">
                  {Object.keys(MOCK_DATASETS).map(key => (
                    <button
                      key={key}
                      onClick={() => setDataKey(key)}
                      className={`px-3 py-2 text-sm text-left rounded-md transition-colors ${
                        dataKey === key
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'hover:bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {key.charAt(0).toUpperCase() + key.slice(1)} Data
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-white transition-all ${
                  isLoading
                    ? 'bg-zinc-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Play className="w-5 h-5 fill-current" />
                )}
                {isLoading ? 'Generating...' : 'Generate Component'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-200">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* --- Results Area --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">
          {/* Left: Render Preview */}
          <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="bg-zinc-50 border-b border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider flex justify-between items-center">
              <span>Preview</span>
              <span className="bg-zinc-200 px-1.5 py-0.5 rounded text-[10px]">Shadow DOM</span>
            </div>
            <div className="flex-1 p-8 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] flex items-center justify-center overflow-auto">
              {/* The Widget */}
              <div className="w-full max-w-sm">
                <ShadowWidget spec={spec} />
              </div>
            </div>
          </div>

          {/* Right: Code Inspector */}
          <div className="flex flex-col h-full bg-zinc-900 rounded-xl shadow-sm border border-zinc-800 overflow-hidden text-zinc-100">
            <div className="bg-zinc-800/50 border-b border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Code className="w-3 h-3" /> Source Payload
            </div>
            <div className="flex-1 overflow-auto p-4 font-mono text-xs">
              <div className="mb-4">
                <span className="text-zinc-500 block mb-1">// HTML Structure</span>
                <pre className="text-emerald-400 whitespace-pre-wrap">{spec.html}</pre>
              </div>
              <div>
                <span className="text-zinc-500 block mb-1">// Render Logic (JS)</span>
                <pre className="text-blue-400 whitespace-pre-wrap">{spec.js}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TestPage
