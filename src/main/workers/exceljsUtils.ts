import ExcelJS from 'exceljs'
import { ExcelProcessResult, normalizeHeaders, findHeaderRow } from './excelUtils' // Reuse helpers

export { normalizeHeaders, findHeaderRow } from './excelUtils'
export type { ExcelProcessResult }

/**
 * Process Excel buffer using exceljs
 */
export async function processExcelBufferExcelJS(
  fileBuffer: Buffer,
  targetSheetName?: string,
  targetTableName?: string
): Promise<{ results: ExcelProcessResult[]; allSheetsCount: number }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(fileBuffer as any)

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
      // ExcelJS rows are 1-based
      const data: any[][] = []

      worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        // exceljs row.values is [undefined, val1, val2, ...] because of 1-based indexing
        // We slice(1) to get 0-based array
        // However, row.values might be an object if columns are defined, but here we load from buffer so it should be array-like
        // A safer way is to iterate cells

        const rowData: any[] = []
        // Determine row span. row.cellCount isn't always reliable for sparse rows?
        // Use worksheet.columnCount or similar?
        // Let's just use the cell values.

        // Note: row.values exists but has the 1-based quirk.
        if (Array.isArray(row.values)) {
             // row.values[0] is undefined/empty.
             // We need to handle sparse arrays carefully.
             // Mapping row.values to a clean array
             const values = row.values as any[]
             // ExcelJS values array length = max column index + 1
             for(let i = 1; i < values.length; i++) {
                 rowData[i-1] = values[i]
             }
        } else if (typeof row.values === 'object') {
            // Should not happen for basic load, but handle just in case
            // row.values might be {1: 'a', 2: 'b'}
            // ...
            // Let's stick to iterating cells if unsure, but row.values is faster
             const values = row.values as any
             // Find max key?
             // Simplest: iterate columns
             worksheet.columns?.forEach((col, idx) => {
                 // ... this is complex without knowing headers.
             })
        }

        // Handling Merged Cells:
        // ExcelJS returns the value for the master cell.
        // For other cells in the merge, value is null/undefined usually.
        // But the cell object has .master.
        // We need to fill the value if it's merged.

        const filledRowData: any[] = []
        const maxCol = worksheet.columnCount // or calculate from row

        // Actually, let's iterate up to the last cell index of this row
        const cellCount = row.cellCount
        // But row.cellCount only counts non-empty?
        // row.actualCellCount ?

        // Better approach: Iterate from 1 to row.cellCount (or explicit bounds)
        // But wait, row.getCell(i) is robust.

        // Performance Warning: getCell might be slow if called millions of times.
        // Let's try to trust row.values first, and handle merges separately?
        // Or just use getCell which handles merges automatically?
        // "When a cell is part of a merge, its value is shared..." - Wait, checking docs.
        // ExcelJS: "Master cell has the value. Other cells share the value IF accessed via API?"
        // Checking: cell.value might be the value or null. cell.master is the master cell.

        for (let colNumber = 1; colNumber <= row.cellCount; colNumber++) { // This might skip trailing empty cells
             // We want consistent columns.
             // We'll normalize length later (padding).

             const cell = row.getCell(colNumber)

             // Handle Merge: if cell is merged but not master, use master's value
             let val = cell.value
             if (cell.isMerged && cell.master && cell !== cell.master) {
                 val = cell.master.value
             }

             // ExcelJS Rich Text / Hyperlinks / Formula
             if (val && typeof val === 'object') {
                 if ('richText' in val) {
                     val = (val as any).richText.map((t: any) => t.text).join('')
                 } else if ('text' in val && 'hyperlink' in val) {
                     val = (val as any).text
                 } else if ('result' in val) { // Formula
                     val = (val as any).result
                 } else if (val instanceof Date) {
                     // Keep Date object
                 } else {
                     // Unknown object, maybe error
                     val = String(val)
                 }
             }

             // 0-based index
             filledRowData[colNumber - 1] = val
        }

        data.push(filledRowData)
      })

      if (data.length === 0) continue

      // Reuse finding headers logic
      const { headerRowIndex, headers } = findHeaderRow(data)
      const normalizedHeaders = normalizeHeaders(headers)
      const colCount = normalizedHeaders.length

      // Filter empty rows
      const dataRows = data.slice(headerRowIndex + 1).filter(row => {
        return row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
      })

      const csvLines = dataRows.map(row => {
        const rowData: string[] = []
        for (let i = 0; i < colCount; i++) {
          const cell = row[i]
          let strCell = ''

          if (cell === null || cell === undefined) {
            strCell = ''
          } else if (cell instanceof Date && !isNaN(cell.getTime())) {
            // Fix Excel floating point date precision issues (e.g. 23:59:59.999)
            // Round to nearest second
            const time = cell.getTime()
            const roundedTime = Math.round(time / 1000) * 1000
            const roundedDate = new Date(roundedTime)

            // Smart formatting for DuckDB type inference
            if (
              roundedDate.getUTCHours() === 0 &&
              roundedDate.getUTCMinutes() === 0 &&
              roundedDate.getUTCSeconds() === 0
            ) {
              strCell = roundedDate.toISOString().split('T')[0]
            } else {
              strCell = roundedDate.toISOString()
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

      results.push({ sheetName: worksheet.name, csvData })

    } catch (e: any) {
      results.push({ sheetName: worksheet.name, csvData: '', error: e.message })
    }
  }

  return { results, allSheetsCount: workbook.worksheets.length }
}
