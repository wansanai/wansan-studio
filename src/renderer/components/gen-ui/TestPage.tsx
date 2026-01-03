import React, { useState } from 'react'
import ShadowWidget, { GenComponentSpec } from './ShadowWidget'
import { Loader2, Play, AlertCircle, Info, Zap } from 'lucide-react'

// --- Step 1: Mock Data for Insight-Driven Spike ---
const INSIGHT_SCENARIOS = {
  normal: {
    label: "Normal Growth (User Growth)",
    data: { values: [100, 115, 120, 135], context: "User Growth" }
  },
  surge: {
    label: "Critical Surge (Compliance Issues)",
    data: { values: [100, 150, 300, 650], context: "Compliance Issues" }
  }
}

const INITIAL_SPEC: GenComponentSpec = {
  html: `
    <div class="p-6 bg-zinc-50 border border-zinc-200 rounded-2xl shadow-sm font-sans text-zinc-900">
      <div class="flex items-center gap-2 mb-4 text-zinc-500">
        <i data-lucide="info" class="w-4 h-4"></i>
        <span class="text-xs font-semibold uppercase tracking-wider">System Ready</span>
      </div>
      <h2 class="text-xl font-bold mb-2">Select a scenario to begin</h2>
      <p class="text-sm text-zinc-600">The AI will analyze data and decide the theme (Blue vs Red) based on growth and context.</p>
    </div>
  `,
  js: "if (window.lucide) { window.lucide.createIcons({ root: shadow }); }",
  data: {}
}

const TestPage = () => {
  const [scenario, setScenario] = useState<keyof typeof INSIGHT_SCENARIOS>('normal')
  const [spec, setSpec] = useState<GenComponentSpec>(INITIAL_SPEC)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    
    const currentData = INSIGHT_SCENARIOS[scenario].data

    // --- Step 2: Construct Chain-of-Thought Prompt ---
    const cotPrompt = `
Analyze the following data context and values: 
${JSON.stringify(currentData)}

1. Calculate the growth rate between start and end.
2. Determine the sentiment: 
   - IF growth > 50% AND context is 'Compliance Issues' -> sentiment is 'Critical'.
   - ELSE -> sentiment is 'Neutral'.
3. Generate a UI Component (HTML/JS) based on the sentiment:
   - If Critical: Use a Red Warning theme (bg-red-50, text-red-900, border-red-200). Add a 'alert-triangle' icon.
   - If Neutral: Use a Blue/Zinc Info theme (bg-blue-50, text-blue-900, border-blue-200). Add an 'info' icon.
4. Chart: Render a smooth area chart of the 'values'.
5. Title: Create a punchy title based on the insight (e.g., "Critical Issue Spike" or "Steady User Growth").
`

    try {
      if (!window.electronAPI?.generateUI) {
        throw new Error('API not available.')
      }

      const result = await window.electronAPI.generateUI(cotPrompt, [currentData])

      if (result.success && result.data) {
        setSpec({
          html: result.data.spec.html,
          js: result.data.spec.js,
          data: [currentData], // Wrap in array to match AI's data[0] expectation
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
    <div className="p-8 bg-zinc-100 min-h-screen font-sans text-zinc-900">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 flex items-center justify-center gap-3">
            <Zap className="w-8 h-8 text-yellow-500 fill-current" />
            Insight-Driven GenUI
          </h1>
          <p className="text-zinc-500 text-sm">Testing AI's ability to adapt theme and icons based on data semantics.</p>
        </div>

        {/* Scenario Selector */}
        <div className="grid grid-cols-2 gap-4">
          {(Object.entries(INSIGHT_SCENARIOS) as [keyof typeof INSIGHT_SCENARIOS, any][]).map(([key, item]) => (
            <button
              key={key}
              onClick={() => setScenario(key)}
              className={`p-6 rounded-2xl border-2 transition-all text-left space-y-2 ${ 
                scenario === key 
                  ? 'bg-white border-indigo-600 shadow-xl scale-[1.02]' 
                  : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300 opacity-60 hover:opacity-100'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className={`text-xs font-black uppercase tracking-widest ${scenario === key ? 'text-indigo-600' : 'text-zinc-400'}`}>
                  Scenario: {key}
                </span>
                {key === 'surge' ? <AlertCircle className="w-4 h-4 text-red-500" /> : <Info className="w-4 h-4 text-blue-500" />}
              </div>
              <h3 className="font-bold text-lg">{item.label}</h3>
              <div className="text-xs font-mono text-zinc-400 truncate">
                {JSON.stringify(item.data)}
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className={`group relative flex items-center justify-center gap-3 py-4 px-12 rounded-full font-black text-white transition-all overflow-hidden ${ 
              isLoading ? 'bg-zinc-400' : 'bg-zinc-900 hover:bg-black shadow-2xl hover:-translate-y-1'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
            )}
            {isLoading ? 'ANALYZING DATA...' : 'GENERATE INSIGHT CARD'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 text-red-700 p-4 rounded-xl text-xs font-mono border border-red-200">
            {error}
          </div>
        )}

        {/* Results */}
        <div className="flex justify-center">
          <div className="w-full max-w-md">
            <ShadowWidget spec={spec} />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-6 text-zinc-400 font-mono text-[10px] overflow-auto max-h-48">
          <div className="flex items-center gap-2 mb-2 text-zinc-500 border-b border-zinc-800 pb-2">
            <Zap className="w-3 h-3" /> CURRENT AI PROMPT STRATEGY (CHAIN-OF-THOUGHT)
          </div>
          <pre className="whitespace-pre-wrap">
            {`1. Analyze Growth\n2. Determine Sentiment (Critical if Issues + Surge)\n3. Theme Mapping (Red vs Blue)\n4. Render UI`}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default TestPage