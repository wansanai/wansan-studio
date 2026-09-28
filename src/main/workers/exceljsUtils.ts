import ExcelJS from 'exceljs'
import * as fs from 'fs'
import * as path from 'path'

export interface ExcelProcessResult {
  sheetName: string
  csvData: string
  headers?: string[]
  error?: string
}

interface RichTextPart {
  text: string
}

interface RichTextValue {
  richText: RichTextPart[]
}

interface HyperlinkValue {
  text: string
  hyperlink: string
}

interface FormulaValue {
  result?: ExcelJS.CellValue
}

interface ErrorValue {
  error?: string
}

interface WorksheetReaderLike {
  name?: string
}

type WorkbookLoadInput = Parameters<ExcelJS.Workbook['xlsx']['load']>[0]

function isRichTextValue(value: unknown): value is RichTextValue {
  return typeof value === 'object' && value !== null && 'richText' in value
}

function isHyperlinkValue(value: unknown): value is HyperlinkValue {
  return typeof value === 'object' && value !== null && 'text' in value && 'hyperlink' in value
}

function isFormulaValue(value: unknown): value is FormulaValue {
  return typeof value === 'object' && value !== null && 'result' in value
}

function isErrorValue(value: unknown): value is ErrorValue {
  return typeof value === 'object' && value !== null && 'error' in value
}

function toCellString(value: unknown) {
  return value === null || value === undefined ? '' : String(value)
}

function resolveComplexCellValue(value: ExcelJS.CellValue): ExcelJS.CellValue | string {
  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value
  }

  if (isRichTextValue(value) && Array.isArray(value.richText)) {
    return value.richText.map(part => part.text).join('')
  }

  if (isHyperlinkValue(value)) {
    return value.text
  }

  if (isFormulaValue(value)) {
    const result = value.result
    if (result && typeof result === 'object' && !(result instanceof Date)) {
      if (isErrorValue(result)) return result.error || ''
      try {
        return JSON.stringify(result)
      } catch {
        return String(result)
      }
    }
    return result ?? ''
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function normalizeHeaders(headers: string[]): string[] {
  const counts: { [key: string]: number } = {}
  return headers.map(header => {
    const baseName = header || 'unnamed_column'
    if (counts[baseName] === undefined) {
      counts[baseName] = 0
      return baseName
    } else {
      counts[baseName]++
      return `${baseName}_${counts[baseName]}`
    }
  })
}

export function findHeaderRow(data: ExcelJS.CellValue[][]): {
  headerRowIndex: number
  headers: string[]
} {
  let headerRowIndex = 0
  let maxNonEmpty = 0

  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i]
    if (!row) continue
    const nonEmptyCount = row.filter(
      cell => cell !== null && cell !== undefined && cell !== ''
    ).length

    if (
      row.length > 0 &&
      nonEmptyCount / row.length > 0.5 &&
      nonEmptyCount > maxNonEmpty
    ) {
      headerRowIndex = i
      maxNonEmpty = nonEmptyCount
    }
  }

  const headers = data[headerRowIndex]?.map(h => toCellString(h)) || []
  return { headerRowIndex, headers }
}

export interface StreamingProcessResult {
  sheetName: string
  csvFilePath: string
  rowCount: number
  headers?: string[]
  error?: string
}

/**
 * Helper to check if an Excel number format string represents a date
 */
function isDateFmt(fmt: string): boolean {
  if (!fmt) return false
  const f = fmt.toLowerCase()
  // Excel date formats typically contain y, m, d, h, s or Chinese date characters
  // We exclude formats that are purely numeric but happen to have 'd' (like [Red])
  if (f.includes('red') || f.includes('blue')) return false
  return /[ymdhs年\u6708\u65e5]/.test(f)
}

/**
 * Process Excel file using Streaming Reader (Low Memory)
 */
export async function processExcelFileStreaming(
  filePath: string,
  outputDir: string,
  targetSheetName?: string,
  targetTableName?: string,
  onProgress?: (rowCount: number) => void,
  onlyHeaders: boolean = false
): Promise<{ results: StreamingProcessResult[]; allSheetsCount: number }> {
  const options = {
    sharedStrings: 'cache' as const,
    styles: 'cache' as const,
    hyperlinks: 'emit' as const,
    worksheets: 'emit' as const,
  }

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(
    filePath,
    options
  )
  const results: StreamingProcessResult[] = []
  let sheetCount = 0

  for await (const worksheetReader of workbookReader) {
    sheetCount++
    const sheetName = (worksheetReader as WorksheetReaderLike).name || `Sheet${sheetCount}`

    // Filter logic
    let shouldProcess = false
    if (targetSheetName) {
      if (sheetName === targetSheetName) shouldProcess = true
    } else if (targetTableName && !targetSheetName) {
      if (sheetCount === 1) shouldProcess = true
    } else {
      shouldProcess = true
    }

    if (!shouldProcess) {
      for await (const row of worksheetReader) {
        // consume and ignore
        void row
      }
      continue
    }

    try {
      const tempCsvName = `temp_ingest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.csv`
      const csvFilePath = onlyHeaders ? '' : path.join(outputDir, tempCsvName)
      const writeStream = onlyHeaders
        ? null
        : fs.createWriteStream(csvFilePath, {
            encoding: 'utf8',
          })

      // Buffer for header detection
      const ROW_BUFFER_SIZE = 50
      const rowBuffer: ExcelJS.CellValue[][] = []
      let headersFound = false
      let headerRowIndex = 0
      let normalizedHeaders: string[] = []
      let colCount = 0
      let rowCount = 0

      // Helper to process a row into CSV line
      const processRowToCSV = (rowValues: ExcelJS.CellValue[]) => {
        const rowData: string[] = []
        for (let i = 0; i < colCount; i++) {
          const cell = rowValues[i]
          let strCell = ''

          if (cell === null || cell === undefined) {
            strCell = ''
          } else if (cell instanceof Date && !isNaN(cell.getTime())) {
            const time = cell.getTime()
            const roundedTime = Math.round(time / 1000) * 1000
            const roundedDate = new Date(roundedTime)

            const year = roundedDate.getUTCFullYear()
            const month = String(roundedDate.getUTCMonth() + 1).padStart(2, '0')
            const day = String(roundedDate.getUTCDate()).padStart(2, '0')
            const hours = roundedDate.getUTCHours()
            const minutes = roundedDate.getUTCMinutes()
            const seconds = roundedDate.getUTCSeconds()

            if (hours === 0 && minutes === 0 && seconds === 0) {
              strCell = `${year}-${month}-${day}`
            } else {
              const h = String(hours).padStart(2, '0')
              const min = String(minutes).padStart(2, '0')
              const s = String(seconds).padStart(2, '0')
              strCell = `${year}-${month}-${day}T${h}:${min}:${s}.000`
            }
          } else {
            strCell = String(cell)
          }
          rowData.push(`"${strCell.replace(/"/g, '""')}"`)
        }
        return rowData.join(',')
      }

      // Iterate rows in the sheet
      for await (const row of worksheetReader) {
        // In streaming mode, row.values is fast but row.getCell is needed for styles
        // We iterate manually to handle Date serial conversion if styles are available
        const values: ExcelJS.CellValue[] = []
        const rowValues = row.values as ExcelJS.CellValue[]
        const maxCol = Array.isArray(rowValues) ? rowValues.length - 1 : 0

        for (let i = 1; i <= maxCol; i++) {
          const cell = row.getCell(i)
          let val = cell.value

          // [FIX] Handle Excel Serial Dates that are inferred as numbers
          if (
            typeof val === 'number' &&
            cell.numFmt &&
            isDateFmt(cell.numFmt)
          ) {
            // Excel epoch is 1899-12-30 (25569 days before Unix epoch)
            const date = new Date(Math.round((val - 25569) * 86400 * 1000))
            if (!isNaN(date.getTime())) {
              val = date
            }
          }

          // Handle Rich Text / Hyperlinks
          if (val && typeof val === 'object' && !(val instanceof Date)) {
            val = resolveComplexCellValue(val)
          }
          values[i - 1] = val
        }

        if (!headersFound) {
          rowBuffer.push(values)

          if (rowBuffer.length >= ROW_BUFFER_SIZE) {
            // Try detect
            const { headerRowIndex: foundIndex, headers } =
              findHeaderRow(rowBuffer)
            headerRowIndex = foundIndex
            normalizedHeaders = normalizeHeaders(headers)
            colCount = normalizedHeaders.length

            // Write Header
            const headerLine = normalizedHeaders
              .map(h => `"${String(h).replace(/"/g, '""')}"`)
              .join(',')
            writeStream.write(headerLine + '\n')

            // Flush Buffer (from headerRowIndex + 1)
            for (let i = headerRowIndex + 1; i < rowBuffer.length; i++) {
              const buffRow = rowBuffer[i]
              // Filter empty rows
              if (
                buffRow.some(
                  c => c !== null && c !== undefined && String(c).trim() !== ''
                )
              ) {
                writeStream.write(processRowToCSV(buffRow) + '\n')
                rowCount++
                if (onProgress && rowCount % 5000 === 0) onProgress(rowCount)
              }
            }
            headersFound = true
            rowBuffer.length = 0 // Clear memory
          }
        } else {
          // Stream mode: process directly
          if (
            values.some(
              c => c !== null && c !== undefined && String(c).trim() !== ''
            )
          ) {
            writeStream.write(processRowToCSV(values) + '\n')
            rowCount++
            if (onProgress && rowCount % 5000 === 0) onProgress(rowCount)
          }
        }
      }

      // End of rows. If headers still not found (file < 50 rows)
      if (!headersFound && rowBuffer.length > 0) {
        const { headerRowIndex: foundIndex, headers } = findHeaderRow(rowBuffer)
        headerRowIndex = foundIndex
        normalizedHeaders = normalizeHeaders(headers)

        if (onlyHeaders) {
          results.push({ sheetName, csvFilePath: '', rowCount: 0, headers: normalizedHeaders })
        } else {
          colCount = normalizedHeaders.length

          const headerLine = normalizedHeaders
            .map(h => `"${String(h).replace(/"/g, '""')}"`)
            .join(',')
          writeStream?.write(headerLine + '\n')

          for (let i = headerRowIndex + 1; i < rowBuffer.length; i++) {
            const buffRow = rowBuffer[i]
            if (
              buffRow.some(
                c => c !== null && c !== undefined && String(c).trim() !== ''
              )
            ) {
              writeStream?.write(processRowToCSV(buffRow) + '\n')
              rowCount++
              if (onProgress && rowCount % 5000 === 0) onProgress(rowCount)
            }
          }
        }
      }

      if (onProgress) onProgress(rowCount)

      if (writeStream) {
        writeStream.end()

        // Wait for finish
        await new Promise((resolve, reject) => {
          writeStream!.on('finish', () => resolve(null))
          writeStream!.on('error', reject)
        })

        results.push({
          sheetName,
          csvFilePath,
          rowCount,
          headers: normalizedHeaders,
        })
      }
    } catch (e: unknown) {
      console.error(`Error processing sheet ${sheetName}:`, e)
      results.push({
        sheetName,
        csvFilePath: '',
        rowCount: 0,
        error: getErrorMessage(e),
      })
    }
  }

  return { results, allSheetsCount: sheetCount }
}

/**
 * Process Excel buffer using exceljs
 */
export async function processExcelBufferExcelJS(
  fileBuffer: Buffer,
  targetSheetName?: string,
  targetTableName?: string,
  onProgress?: (rowCount: number, isIntermediate?: boolean) => void,
  onlyHeaders: boolean = false
): Promise<{ results: ExcelProcessResult[]; allSheetsCount: number }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(fileBuffer as unknown as WorkbookLoadInput)

  // After the most expensive part (load), signal that we are halfway
  if (onProgress) onProgress(0, true) // Intermediate progress

  const results: ExcelProcessResult[] = []

  // Filter sheets
  let sheetsToProcess: ExcelJS.Worksheet[] = []

  if (targetSheetName) {
    const sheet = workbook.getWorksheet(targetSheetName)
    if (sheet) sheetsToProcess.push(sheet)
  } else if (targetTableName && !targetSheetName) {
    // Legacy: first sheet
    const firstSheet = workbook.worksheets[0]
    if (firstSheet) sheetsToProcess.push(firstSheet)
  } else {
    sheetsToProcess = workbook.worksheets
  }

  for (const worksheet of sheetsToProcess) {
    try {
      // 1. Extract data matrix from worksheet
      const data: ExcelJS.CellValue[][] = []
      const totalRows = worksheet.rowCount

      // Pre-check for merges to optimize
      const hasMerges = worksheet.hasMerges

      worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        if (onlyHeaders && rowNumber > 50) return // Limit reading for inspect

        const filledRowData: ExcelJS.CellValue[] = []

        if (!hasMerges && Array.isArray(row.values)) {
          // FAST PATH: No merges, use values directly
          const values = row.values as ExcelJS.CellValue[]
          // ExcelJS values are 1-based (index 0 is undefined)
          for (let i = 1; i < values.length; i++) {
            let val = values[i]

            // Handle Complex Types (Rich Text, Hyperlink, Formula Error)
            if (val && typeof val === 'object' && !(val instanceof Date)) {
              // If it's an object, we might need to inspect it or use getCell to be safe
              // But getCell is slow. Let's try to extract common patterns first.
              const normalized = resolveComplexCellValue(val)
              if (typeof normalized === 'string' || normalized instanceof Date || typeof normalized !== 'object') {
                val = normalized
              } else {
                const cell = row.getCell(i)
                val = cell.value
              }
            }
            filledRowData[i - 1] = val
          }
        } else {
          // SLOW PATH: Merges exist or row.values is weird
          // Fallback to cell iteration
          for (let colNumber = 1; colNumber <= row.cellCount; colNumber++) {
            const cell = row.getCell(colNumber)
            let val = cell.value
            if (cell.isMerged && cell.master && cell !== cell.master) {
              val = cell.master.value
            }

            // Handle Rich Text / Hyperlinks
            if (val && typeof val === 'object' && !(val instanceof Date)) {
              val = resolveComplexCellValue(val)
            }
            filledRowData[colNumber - 1] = val
          }
        }

        data.push(filledRowData)

        // Report progress
        if (!onlyHeaders && onProgress && totalRows > 0 && rowNumber % 1000 === 0) {
          onProgress((rowNumber / totalRows) * 100)
        }
      })

      if (data.length === 0) continue

      // Reuse finding headers logic
      const { headerRowIndex, headers } = findHeaderRow(data)
      const normalizedHeaders = normalizeHeaders(headers)

      if (onlyHeaders) {
        results.push({
          sheetName: worksheet.name,
          csvData: '',
          headers: normalizedHeaders,
        })
        continue
      }

      const colCount = normalizedHeaders.length

      // Filter empty rows
      const dataRows = data.slice(headerRowIndex + 1).filter(row => {
        return (
          row &&
          row.some(
            cell =>
              cell !== null && cell !== undefined && String(cell).trim() !== ''
          )
        )
      })

      const csvLines = dataRows.map(row => {
        const rowData: string[] = []
        for (let i = 0; i < colCount; i++) {
          const cell = row[i]
          let strCell = ''

          if (cell === null || cell === undefined) {
            strCell = ''
          } else if (cell instanceof Date && !isNaN(cell.getTime())) {
            // 1. Fix Excel floating point date precision issues (e.g. 23:59:59.999)
            // Round to nearest second to stabilize
            const time = cell.getTime()
            const roundedTime = Math.round(time / 1000) * 1000
            const roundedDate = new Date(roundedTime)

            // 2. Use UTC methods to extract "Wall Time" components
            // ExcelJS parses dates as UTC timestamps. e.g. "2023-01-01" -> UTC 00:00:00.
            // We must use UTC getters to retrieve the original literal values.
            const year = roundedDate.getUTCFullYear()
            const month = String(roundedDate.getUTCMonth() + 1).padStart(2, '0')
            const day = String(roundedDate.getUTCDate()).padStart(2, '0')
            const hours = roundedDate.getUTCHours()
            const minutes = roundedDate.getUTCMinutes()
            const seconds = roundedDate.getUTCSeconds()

            // 3. Smart Formatting for DuckDB Inference
            if (hours === 0 && minutes === 0 && seconds === 0) {
              // Pure Date -> YYYY-MM-DD
              strCell = `${year}-${month}-${day}`
            } else {
              // Timestamp -> YYYY-MM-DDTHH:mm:ss.sss (Local/Naive ISO)
              const h = String(hours).padStart(2, '0')
              const min = String(minutes).padStart(2, '0')
              const s = String(seconds).padStart(2, '0')
              // Use .000 for milliseconds since we rounded to seconds
              strCell = `${year}-${month}-${day}T${h}:${min}:${s}.000`
            }
          } else {
            strCell = String(cell)
          }

          // CSV Escape
          rowData.push(`"${strCell.replace(/"/g, '""')}"`)
        }
        return rowData.join(',')
      })

      const headerLine = normalizedHeaders
        .map(h => `"${String(h).replace(/"/g, '""')}"`)
        .join(',')

      const csvData = [headerLine, ...csvLines].join('\n')

      results.push({
        sheetName: worksheet.name,
        csvData,
        headers: normalizedHeaders,
      })
    } catch (e: unknown) {
      results.push({ sheetName: worksheet.name, csvData: '', error: getErrorMessage(e) })
    }
  }

  return { results, allSheetsCount: workbook.worksheets.length }
}
