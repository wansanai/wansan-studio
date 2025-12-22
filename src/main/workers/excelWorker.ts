import { parentPort, workerData } from 'worker_threads'
import { processExcelBufferExcelJS } from './exceljsUtils'

interface WorkerData {
  fileBuffer: Buffer
  targetSheetName?: string
  targetTableName?: string
}

async function run() {
  try {
    const { fileBuffer, targetSheetName, targetTableName } =
      workerData as WorkerData

    const { results, allSheetsCount } = await processExcelBufferExcelJS(
      fileBuffer,
      targetSheetName,
      targetTableName
    )

    parentPort?.postMessage({
      success: true,
      data: results,
      allSheetsCount,
    })
  } catch (error: any) {
    parentPort?.postMessage({ success: false, error: error.message })
  }
}

run()
