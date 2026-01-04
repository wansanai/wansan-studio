import React, { useState } from 'react'
import ShadowWidget from './ShadowWidget'
import { GenUIPayload, GenUIResponse, InsightPayload } from '@shared/schemas/gen-ui'
import { Loader2, Play, AlertCircle, Info, Zap, Brain, Palette, Database } from 'lucide-react'

// --- Step 1: Standardized Scenarios ---
const INSIGHT_SCENARIOS = {
  normal: {
    label: "Normal Growth (User Growth)",
    query: "Show me the user growth trend for the past month.",
    data: [
      { period: 'Week 1', value: 100, context: "User Growth" },
      { period: 'Week 2', value: 115, context: "User Growth" },
      { period: 'Week 3', value: 120, context: "User Growth" },
      { period: 'Week 4', value: 135, context: "User Growth" },
    ]
  },
  surge: {
    label: "Critical Surge (Compliance Issues)",
    query: "Analyze the compliance issues escalation.",
    data: [
      { period: 'Week 1', value: 100, context: "Compliance Issues" },
      { period: 'Week 2', value: 150, context: "Compliance Issues" },
      { period: 'Week 3', value: 300, context: "Compliance Issues" },
      { period: 'Week 4', value: 650, context: "Compliance Issues" },
    ]
  }
}

const INITIAL_SPEC: { payload: GenUIPayload; data: any } = {
  payload: {
    html: `
      <div class="p-6 bg-zinc-50 border border-zinc-200 rounded-2xl shadow-sm font-sans text-zinc-900">
        <div class="flex items-center gap-2 mb-4 text-zinc-500">
          <i data-lucide="zap" class="w-4 h-4"></i>
          <span class="text-xs font-semibold uppercase tracking-wider">Semantic UI Engine</span>
        </div>
        <h2 class="text-xl font-bold mb-2">Ready for Analysis</h2>
        <p class="text-sm text-zinc-600">Select a scenario and click 'Run Pipeline' to see the 2-step generation flow.</p>
      </div>
    `,
    js: "if (window.lucide) { window.lucide.createIcons({ root: this }); }",
  },
  data: []
}

const TestPage = () => {
  const [scenario, setScenario] = useState<keyof typeof INSIGHT_SCENARIOS>('normal')
  const [response, setResponse] = useState<GenUIResponse | null>(null)
  const [spec, setSpec] = useState<{ payload: GenUIPayload; data: any }>(INITIAL_SPEC)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    
    const { data, query } = INSIGHT_SCENARIOS[scenario]

    try {
      if (!window.electronAPI?.generateSemanticUI) {
        throw new Error('API not available.')
      }

      // 🚀 Trigger the 2-step Pipeline: Data -> Insight -> UI
      const result = await window.electronAPI.generateSemanticUI(query, data)

      if (result.success && result.data) {
        setResponse(result.data)
        setSpec({
          payload: result.data.spec,
          data: data,
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

  const sentimentColors = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    warning: 'bg-orange-100 text-orange-700 border-orange-200',
    positive: 'bg-green-100 text-green-700 border-green-200',
    neutral: 'bg-blue-100 text-blue-700 border-blue-200'
  }

  return (
    <div className="p-8 bg-zinc-100 min-h-screen font-sans text-zinc-900">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-end border-b border-zinc-200 pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tighter text-zinc-900 flex items-center gap-3 uppercase">
              <Zap className="w-8 h-8 text-indigo-600 fill-current" />
              Semantic GenUI pipeline
            </h1>
            <p className="text-zinc-500 text-sm font-medium">Validating Brain-Hand decoupling architecture (v1.4)</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className={`flex items-center gap-3 py-3 px-10 rounded-full font-black text-sm uppercase tracking-widest text-white transition-all ${ 
              isLoading ? 'bg-zinc-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-xl hover:-translate-y-0.5'
            }`}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            Run Pipeline
          </button>
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Left Column: Input & Context */}
          <div className="col-span-4 space-y-6">
            <section className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
                <Database className="w-3 h-3" /> Select Scenario
              </label>
              <div className="flex flex-col gap-2">
                {(Object.entries(INSIGHT_SCENARIOS) as [keyof typeof INSIGHT_SCENARIOS, any][]).map(([key, item]) => (
                  <button
                    key={key}
                    onClick={() => setScenario(key)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${ 
                      scenario === key 
                        ? 'bg-white border-indigo-600 shadow-lg' 
                        : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300 opacity-60'
                    }`}
                  >
                    <h3 className="font-bold text-sm mb-1">{item.label}</h3>
                    <p className="text-[10px] text-zinc-400 font-mono italic">"{item.query}"</p>
                  </button>
                ))}
              </div>
            </section>

            {response?.insight && (
              <section className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-left-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 flex items-center gap-2">
                    <Brain className="w-3 h-3" /> Phase 1: Analyst
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${sentimentColors[response.insight.sentiment as keyof typeof sentimentColors]}`}>
                    {response.insight.sentiment}
                  </span>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest mb-1">Key Insight</p>
                    <p className="text-sm font-semibold leading-snug">{response.insight.primary_metric.label}: {response.insight.primary_metric.value}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest mb-1">Narrative</p>
                    <p className="text-xs text-zinc-600 leading-relaxed italic">{response.insight.summary}</p>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Rendering & Code */}
          <div className="col-span-8 space-y-6">
            <section className="bg-zinc-200/50 rounded-3xl p-8 flex items-center justify-center min-h-[500px] relative border-4 border-white shadow-inner">
              <div className="absolute top-4 left-6 flex items-center gap-2">
                <Palette className="w-3 h-3 text-zinc-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Phase 2: Designer Output</span>
              </div>
              
              <div className="w-full max-w-lg">
                <ShadowWidget 
                  payload={spec.payload} 
                  data={spec.data} 
                  width="100%" 
                  height={500} 
                />
              </div>
            </section>

            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-xl text-xs font-mono border border-red-200">
                [PIPELINE_ERROR] {error}
              </div>
            )}

            <div className="bg-zinc-900 rounded-2xl p-6 text-zinc-500 font-mono text-[10px] overflow-auto max-h-48 border border-zinc-800">
              <div className="flex items-center gap-2 mb-2 text-zinc-400 border-b border-zinc-800 pb-2 uppercase tracking-widest font-black">
                System Payload Debug
              </div>
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(response?.spec || INITIAL_SPEC.payload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TestPage
