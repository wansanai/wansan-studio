export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
  args?: unknown[]
}

const MAX_LOGS = 200
const logs: LogEntry[] = []

function formatArgs(args: unknown[]) {
  return args.map(arg => {
    if (arg instanceof Error) return { message: arg.message, stack: arg.stack }
    return arg
  })
}

export function captureLog(
  level: 'info' | 'warn' | 'error',
  message: unknown,
  ...args: unknown[]
) {
  if (level !== 'error') return

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: String(message),
    args: args.length > 0 ? formatArgs(args) : undefined,
  }

  logs.unshift(entry)
  if (logs.length > MAX_LOGS) logs.pop()
}

export function getMainLogs() {
  return logs
}

const originalConsoleError = console.error

export function setupLogger() {
  console.error = (message?: unknown, ...optionalParams: unknown[]) => {
    originalConsoleError(message, ...optionalParams)
    captureLog('error', message, ...optionalParams)
  }

  process.on('uncaughtException', error => {
    console.error('Uncaught Exception:', error)
  })

  process.on('unhandledRejection', reason => {
    console.error('Unhandled Rejection:', reason)
  })
}
