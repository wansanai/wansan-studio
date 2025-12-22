import { describe, it, expect, vi } from 'vitest'
import * as XLSX from 'xlsx'
import {
  normalizeHeaders,
  findHeaderRow,
  processExcelBuffer,
} from '../excelUtils'

// Helper to create a simple Excel buffer
function createExcelBuffer(
  sheets: Record<string, (string | number | Date | null)[][]>
): Buffer {
  const workbook = XLSX.utils.book_new()
  for (const [name, data] of Object.entries(sheets)) {
    const worksheet = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(workbook, worksheet, name)
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

describe('excelUtils', () => {
  describe('normalizeHeaders', () => {
    it('should deduplicate headers', () => {
      const input = ['id', 'name', 'id', 'value', 'name']
      const expected = ['id', 'name', 'id_1', 'value', 'name_1']
      expect(normalizeHeaders(input)).toEqual(expected)
    })

    it('should handle empty headers', () => {
      const input = ['id', '', 'value', undefined as any]
      const expected = ['id', 'unnamed_column', 'value', 'unnamed_column_1']
      expect(normalizeHeaders(input)).toEqual(expected)
    })
  })

  describe('findHeaderRow', () => {
    it('should find the row with most non-empty cells', () => {
      const data = [
        ['MetaData', null, null], // Row 0
        ['Report', '2023', null], // Row 1
        ['ID', 'Name', 'Value'], // Row 2 (Header)
        [1, 'A', 10], // Row 3
        [2, 'B', 20], // Row 4
      ]
      const result = findHeaderRow(data)
      expect(result.headerRowIndex).toBe(2)
      expect(result.headers).toEqual(['ID', 'Name', 'Value'])
    })

    it('should default to first row if no clear winner', () => {
      const data = [
        ['A', 'B'],
        ['1', '2'],
      ]
      const result = findHeaderRow(data)
      expect(result.headerRowIndex).toBe(0)
    })
  })

  describe('processExcelBuffer', () => {
    it('should process a simple excel file to CSV', () => {
      const buffer = createExcelBuffer({
        Sheet1: [
          ['ID', 'Name'],
          [1, 'Alice'],
          [2, 'Bob'],
        ],
      })

      const { results } = processExcelBuffer(buffer)
      expect(results).toHaveLength(1)
      expect(results[0].sheetName).toBe('Sheet1')
      
      const csv = results[0].csvData
      // "ID","Name"
      // "1","Alice"
      // "2","Bob"
      expect(csv).toContain('"ID","Name"')
      expect(csv).toContain('"1","Alice"')
      expect(csv).toContain('"2","Bob"')
    })

    it('should handle dates correctly (Smart Date vs Timestamp)', () => {
      // Create dates representing what we see in Excel (Local Time)
      // e.g. "2023-01-01" in local time
      const pureDate = new Date(2023, 0, 1, 0, 0, 0) 
      const timestamp = new Date(2023, 0, 1, 12, 30, 45)
      
      const buffer = createExcelBuffer({
        Dates: [
          ['Type', 'Value'],
          ['Date', pureDate],
          ['Time', timestamp],
        ],
      })

      const { results } = processExcelBuffer(buffer)
      const csv = results[0].csvData
      
      // Should preserve "Wall Time" regardless of timezone
      expect(csv).toContain(`"Date","2023-01-01"`)
      // Timestamp should be ISO string
      expect(csv).toContain(`"Time","2023-01-01T12:30:45.000"`)
    })

    it('should snap near-midnight times to DATE', () => {
      // 23:59:30 -> Should snap to next day (2023-01-02)
      const nearMidnight = new Date(2023, 0, 1, 23, 59, 30)
      // 00:00:20 -> Should snap to current day (2023-01-01)
      const justAfterMidnight = new Date(2023, 0, 1, 0, 0, 20)
      
      const buffer = createExcelBuffer({
        Snaps: [
          ['Type', 'Value'],
          ['Late', nearMidnight],
          ['Early', justAfterMidnight],
        ],
      })

      const { results } = processExcelBuffer(buffer)
      const csv = results[0].csvData
      
      expect(csv).toContain(`"Late","2023-01-02"`)
      expect(csv).toContain(`"Early","2023-01-01"`)
    })

    it('should handle quotes and special characters', () => {
      const buffer = createExcelBuffer({
        Special: [
          ['Text'],
          ['Hello, "World"'], // Comma and quotes
          ['Line\nBreak'], // Newline
        ],
      })

      const { results } = processExcelBuffer(buffer)
      const csv = results[0].csvData

      // "Text"
      // "Hello, ""World"""
      // "Line
      // Break"
      
      expect(csv).toContain('"Hello, ""World""')
      expect(csv).toContain('"Line\nBreak"')
    })

    it('should respect targetSheetName', () => {
      const buffer = createExcelBuffer({
        Sheet1: [['A'], [1]],
        Sheet2: [['B'], [2]],
        Sheet3: [['C'], [3]],
      })

      const { results, allSheetsCount } = processExcelBuffer(buffer, 'Sheet2')
      
      // Should parse all sheet names for count, but only process target
      // Note: In optimization, we pass sheets option to XLSX.read
      // However, XLSX.read returns workbook.SheetNames only for parsed sheets if bookSheets option not used differently?
      // Actually, if we pass `sheets`, `workbook.SheetNames` will only contain those sheets.
      // So allSheetsCount might be 1 in the optimized version.
      // Let's check the implementation return. 
      
      expect(results).toHaveLength(1)
      expect(results[0].sheetName).toBe('Sheet2')
      expect(results[0].csvData).toContain('"B"')
      
      // In the implementation:
      // const workbook = XLSX.read(fileBuffer, readOpts)
      // return { results, allSheetsCount: workbook.SheetNames.length }
      // So if we filter, allSheetsCount will be 1.
      // Correction: XLSX.read returns all SheetNames in metadata even if not parsed.
      expect(allSheetsCount).toBe(3)
    })

    it('should handle legacy targetTableName (default to first sheet)', () => {
      const buffer = createExcelBuffer({
        First: [['First'], [1]],
        Second: [['Second'], [2]],
      })

      // Pass tableName but no sheetName -> should take first sheet (index 0)
      const { results } = processExcelBuffer(buffer, undefined, 'some_table')
      
      expect(results).toHaveLength(1)
      expect(results[0].csvData).toContain('"First"')
    })

    it('should filter out empty rows', () => {
      const buffer = createExcelBuffer({
        EmptyRows: [
          ['Header'],
          ['Row 1'],
          [null], // Empty
          [''],   // Empty string
          [undefined], // Undefined
          ['Row 2'],
        ],
      })

      const { results } = processExcelBuffer(buffer)
      const csv = results[0].csvData
      
      // Should contain header and 2 data rows
      const lines = csv.split('\n')
      expect(lines.length).toBe(3)
      expect(lines[1]).toContain('"Row 1"')
      expect(lines[2]).toContain('"Row 2"')
    })
  })
})
