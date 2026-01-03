export interface GenUISpec {
  html: string // The HTML template (Tailwind classes)
  js: string // The JS function body (no imports)
  // Note: 'data' is NOT part of the AI output, it is injected from DB
}

export interface GenUIResponse {
  spec: GenUISpec
  reasoning: string // Why this visualization was chosen
}
