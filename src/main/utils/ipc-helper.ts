import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IPCContract } from '../../shared/ipc-contract'

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal process error'
}

/**
 * A typed wrapper around ipcMain.handle to ensure the handler
 * follows the defined IPCContract.
 */
export function registerHandler<K extends keyof IPCContract>(
  channel: K,
  handler: (
    event: IpcMainInvokeEvent,
    params: IPCContract[K]['params']
  ) => Promise<IPCContract[K]['return']>
) {
  ipcMain.handle(channel, async (event, params) => {
    try {
      return await handler(event, params)
    } catch (error: unknown) {
      console.error(`[IPC Handler Error] Channel: ${channel}`, error)
      return {
        success: false,
        error: getErrorMessage(error),
      }
    }
  })
}
