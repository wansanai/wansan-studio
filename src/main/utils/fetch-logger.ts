import { isDev } from './env'

function getFetchUrl(resource: RequestInfo | URL) {
  if (typeof resource === 'string') return resource
  if (resource instanceof URL) return resource.toString()
  return resource.url
}

export function setupFetchLogger() {
  if (!isDev()) return

  const originalFetch = global.fetch.bind(global)

  global.fetch = async (
    ...args: Parameters<typeof fetch>
  ): Promise<Response> => {
    const [resource, config] = args
    const url = getFetchUrl(resource)
    const method = (
      config?.method ||
      (typeof resource === 'object' && 'method' in resource ? resource.method : 'GET')
    ).toUpperCase()

    console.log(`
🌐 [Main Fetch] ${method} ${url}`)
    if (config?.headers) {
      console.log('   Headers:', JSON.stringify(config.headers))
    }

    const startTime = Date.now()

    try {
      const response = await originalFetch(...args)
      const duration = Date.now() - startTime

      console.log(`   ✅ Status: ${response.status} (${duration}ms)`)

      const clone = response.clone()
      try {
        const text = await clone.text()
        try {
          const json = JSON.parse(text)
          console.log('   📦 Body:', JSON.stringify(json, null, 2))
        } catch {
          if (text.length > 0) {
            console.log(
              '   📦 Body (Text):',
              text.slice(0, 200) + (text.length > 200 ? '...' : '')
            )
          }
        }
      } catch {
        // ignore body errors
      }

      return response
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`   ❌ Fetch Error (${duration}ms):`, error)
      throw error
    }
  }

  console.log('[Main] Fetch logger enabled')
}
