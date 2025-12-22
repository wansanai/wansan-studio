import * as XLSX from 'xlsx'

export interface ExcelProcessResult {
  sheetName: string
  csvData: string
  error?: string
}

export function unmergeCells(worksheet: XLSX.WorkSheet): void {
  if (!worksheet['!merges']) {
    return
  }
  for (const merge of worksheet['!merges']) {
    const { s: start, e: end } = merge
    const startCellAddress = XLSX.utils.encode_cell(start)
    const startCell = worksheet[startCellAddress]
    if (startCell) {
      for (let r = start.r; r <= end.r; r++) {
        for (let c = start.c; c <= end.c; c++) {
          const cellAddress = XLSX.utils.encode_cell({ r, c })
          if (!worksheet[cellAddress]) {
            worksheet[cellAddress] = { ...startCell, v: startCell.v }
          }
        }
      }
    }
  }
}

export function normalizeHeaders(headers: string[]): string[] {
  const counts: { [key: string]: number } = {}
  return headers.map(header => {
    const baseName = header || 'unnamed_column'
    if (counts[baseName] === undefined) {
      counts[baseName] = 0
      return baseName
    } else {
      counts[baseName]++;
      return `${baseName}_${counts[baseName]}`
    }
  })
}

export function findHeaderRow(data: any[][]): {
  headerRowIndex: number
  headers: string[]
} {
  let headerRowIndex = 0
  let maxNonEmpty = 0

  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i]
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

  const headers = data[headerRowIndex].map((h: any) => String(h || ''))
  return { headerRowIndex, headers }
}

export function processExcelBuffer(
  fileBuffer: Buffer,
  targetSheetName?: string,
  targetTableName?: string
): { results: ExcelProcessResult[]; allSheetsCount: number } {
  // [OPTIMIZATION] Only parse necessary sheets to save memory/CPU
  const readOpts: XLSX.ParsingOptions = { type: 'buffer', cellDates: true }

  if (targetSheetName) {
    readOpts.sheets = [targetSheetName]
  } else if (targetTableName && !targetSheetName) {
    // Legacy re-ingest mode: defaults to first sheet if no sheet name specified
    readOpts.sheets = [0]
  }

  const workbook = XLSX.read(fileBuffer, readOpts)
  const results: ExcelProcessResult[] = []

  // Determine which sheets to process (based on parsed workbook)
  // Note: workbook.SheetNames might contain all sheet names from metadata even if not parsed
  const sheetsToProcess = workbook.SheetNames.filter(
    name => workbook.Sheets[name]
  )

  for (const sheetName of sheetsToProcess) {
    try {
      const worksheet = workbook.Sheets[sheetName]
      unmergeCells(worksheet)

      const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
      })

      if (data.length === 0) {
        continue
      }

      const { headerRowIndex, headers } = findHeaderRow(data)
      const normalizedHeaders = normalizeHeaders(headers)
      const colCount = normalizedHeaders.length

      const dataRows = data.slice(headerRowIndex + 1).filter(row => {
        // Filter out completely empty rows
        return row.some(
          cell => cell !== null && cell !== undefined && String(cell).trim() !== ''
        )
      })

      const csvLines = dataRows.map(row => {
        const rowData = []
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

            // 2. Use LOCAL methods to extract "Wall Time" (the literal values seen in Excel)
            // XLSX (without UTC:true) emits dates relative to the local timezone.
            // Using getFullYear(), getHours() etc. matches the cell's appearance.
            const year = roundedDate.getFullYear()
            const month = String(roundedDate.getMonth() + 1).padStart(2, '0')
            const day = String(roundedDate.getDate()).padStart(2, '0')
            const hours = roundedDate.getHours()
            const minutes = roundedDate.getMinutes()
            const seconds = roundedDate.getSeconds()
            const ms = roundedDate.getMilliseconds()

            // 3. Smart Formatting & Snap-to-Midnight
            // Calculate total seconds into the day
            const secondsInDay = hours * 3600 + minutes * 60 + seconds
            
            // Tolerance: 60 seconds (covers 23:59:xx and 00:00:xx noise)
            const TOLERANCE = 60 
            
            if (secondsInDay < TOLERANCE) {
              // Close to start of day -> Snap to current day 00:00:00
              strCell = `${year}-${month}-${day}`
            } else if (86400 - secondsInDay < TOLERANCE) {
              // Close to end of day -> Snap to next day 00:00:00
              // Create a new date object to handle month/year rollover correctly
              const nextDay = new Date(year, parseInt(month) - 1, Number(day) + 1)
              const ndYear = nextDay.getFullYear()
              const ndMonth = String(nextDay.getMonth() + 1).padStart(2, '0')
              const ndDay = String(nextDay.getDate()).padStart(2, '0')
              strCell = `${ndYear}-${ndMonth}-${ndDay}`
            } else {
              // Timestamp -> YYYY-MM-DDTHH:mm:ss.sss (Local/Naive ISO)
              const h = String(hours).padStart(2, '0')
              const min = String(minutes).padStart(2, '0')
              const s = String(seconds).padStart(2, '0')
              const msec = String(ms).padStart(3, '0')
              strCell = `${year}-${month}-${day}T${h}:${min}:${s}.${msec}`
            }
          } else {
            strCell = String(cell)
          }

          // Escape quotes and wrap in quotes
          rowData.push(`"${strCell.replace(/"/g, '""')}"`)
        }
        return rowData.join(',')
      })

      const headerLine = normalizedHeaders
        .map(h => `"${String(h).replace(/"/g, '""')}"`)
        .join(',')

      const csvData = [headerLine, ...csvLines].join('\n')

      results.push({ sheetName, csvData })
    } catch (e: any) {
      results.push({ sheetName, csvData: '', error: e.message })
    }
  }

  return { results, allSheetsCount: workbook.SheetNames.length }
}