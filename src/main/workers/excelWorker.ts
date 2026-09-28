import {
  processExcelFileStreaming,
  processExcelBufferExcelJS,
} from './exceljsUtils'
import fs from 'fs-extra'
import path from 'path'
import ExcelJS from 'exceljs'
import type { ExcelProcessResult, StreamingProcessResult } from './exceljsUtils'

interface WorkerMessage {
  type: 'inspect' | 'convert'
  filePath: string
  outputDir: string
  targetSheetName?: string
  targetTableName?: string
}

interface WorkerInspectResult {
  sourceName: string
  previewHeaders: string[]
}

interface WorkerConvertResult {
  sheetName: string
  csvFilePath: string
  rowCount: number
}

type WorkbookLoadInput = Parameters<ExcelJS.Workbook['xlsx']['load']>[0]

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getErrorStack(error: unknown) {
  return error instanceof Error ? error.stack : undefined
}

function toInspectData(results: Array<Pick<StreamingProcessResult | ExcelProcessResult, 'sheetName' | 'headers'>>): WorkerInspectResult[] {
  return results.map(result => ({
    sourceName: result.sheetName,
    previewHeaders: result.headers || [],
  }))
}

process.on('message', async (message: WorkerMessage) => {
  const {
    type = 'convert',
    filePath,
    outputDir,
    targetSheetName,
    targetTableName,
  } = message
  const onlyHeaders = type === 'inspect'

  try {
    const stats = await fs.stat(filePath)
    if (stats.size === 0) throw new Error('The file is empty.')

    const fileBuffer = await fs.readFile(filePath)
    const isZip = fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b

    if (isZip) {
      try {
        const { results, allSheetsCount } = await processExcelFileStreaming(
          filePath,
          outputDir,
          targetSheetName,
          targetTableName,
          rowCount => {
            if (process.send && !onlyHeaders) process.send({ type: 'progress', rowCount })
          },
          onlyHeaders
        )

        if (process.send) {
          if (onlyHeaders) {
            process.send({ success: true, data: toInspectData(results) })
          } else {
            process.send({ success: true, data: results, allSheetsCount })
          }
        }
        return
      } catch (streamError: unknown) {
        console.warn(
          '[ExcelWorker] Streaming failed, attempting Buffer fallback. Reason:',
          getErrorMessage(streamError)
        )
      }
    }

    if (onlyHeaders) {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(fileBuffer as unknown as WorkbookLoadInput)

      const sheets: WorkerInspectResult[] = workbook.worksheets.map(ws => {
        const firstRow = ws.getRow(1)
        const rowValues = firstRow.values as ExcelJS.CellValue[]
        const headers = Array.isArray(rowValues)
          ? rowValues.slice(1).map(value => (value === null ? '' : String(value)))
          : []
        return { sourceName: ws.name, previewHeaders: headers }
      })

      if (process.send) process.send({ success: true, data: sheets })
      return
    }

    const { results, allSheetsCount } = await processExcelBufferExcelJS(
      fileBuffer,
      targetSheetName,
      targetTableName,
      (progress, isIntermediate) => {
        if (process.send && !onlyHeaders) {
          const finalProgress = isIntermediate ? 50 : 50 + Math.floor(progress * 0.5)
          process.send({ type: 'progress', isPercentage: true, progress: finalProgress })
        }
      },
      onlyHeaders
    )

    if (onlyHeaders) {
      if (process.send) process.send({ success: true, data: toInspectData(results) })
      return
    }

    const processedResults: WorkerConvertResult[] = []
    for (const res of results) {
      if (res.error) continue
      const tempCsvName = `temp_fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.csv`
      const csvFilePath = path.join(outputDir, tempCsvName)
      await fs.writeFile(csvFilePath, res.csvData)
      processedResults.push({
        sheetName: res.sheetName,
        csvFilePath,
        rowCount: res.csvData.split('\n').length - 1,
      })
    }

    if (process.send) {
      process.send({ success: true, data: processedResults, allSheetsCount })
    }
  } catch (err: unknown) {
    if (process.send) {
      process.send({
        success: false,
        error: getErrorMessage(err),
        stack: getErrorStack(err),
      })
    }
  } finally {
    process.exit(0)
  }
})
