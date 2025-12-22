import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { processExcelBufferExcelJS } from '../exceljsUtils'

// Helper to create a simple Excel buffer using ExcelJS
async function createExcelBuffer(
  sheets: Record<string, (string | number | Date | null)[][]>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  for (const [name, data] of Object.entries(sheets)) {
    const worksheet = workbook.addWorksheet(name)
    worksheet.addRows(data)
  }
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer
}

describe('exceljsUtils', () => {
  describe('processExcelBufferExcelJS', () => {
    it('should process a simple excel file to CSV', async () => {
      const buffer = await createExcelBuffer({
        Sheet1: [
          ['ID', 'Name'],
          [1, 'Alice'],
          [2, 'Bob'],
        ],
      })

      const { results } = await processExcelBufferExcelJS(buffer)
      expect(results).toHaveLength(1)
      expect(results[0].sheetName).toBe('Sheet1')
      
      const csv = results[0].csvData
      expect(csv).toContain('"ID","Name"')
      expect(csv).toContain('"1","Alice"')
      expect(csv).toContain('"2","Bob"')
    })

    it('should handle dates correctly (Smart Date vs Timestamp)', async () => {
      // Create dates representing what we see in Excel (Local Time)
      const pureDate = new Date(2023, 0, 1, 0, 0, 0) 
      const timestamp = new Date(2023, 0, 1, 12, 30, 45)
      
      const buffer = await createExcelBuffer({
        Dates: [
          ['Type', 'Value'],
          ['Date', pureDate],
          ['Time', timestamp],
        ],
      })

      const { results } = await processExcelBufferExcelJS(buffer)
      const csv = results[0].csvData
      
      // Should preserve "Wall Time" regardless of timezone
      expect(csv).toContain('"Date","2023-01-01"')
      expect(csv).toContain('"Time","2023-01-01T12:30:45.000"')
    })

    it('should snap near-midnight times to DATE', async () => {
      // 23:59:30 -> Should snap to next day (2023-01-02)
      const nearMidnight = new Date(2023, 0, 1, 23, 59, 30)
      // 00:00:20 -> Should snap to current day (2023-01-01)
      const justAfterMidnight = new Date(2023, 0, 1, 0, 0, 20)
      
      const buffer = await createExcelBuffer({
        Snaps: [
          ['Type', 'Value'],
          ['Late', nearMidnight],
          ['Early', justAfterMidnight],
        ],
      })

      const { results } = await processExcelBufferExcelJS(buffer)
      const csv = results[0].csvData
      
      expect(csv).toContain('"Late","2023-01-02"')
      expect(csv).toContain('"Early","2023-01-01"')
    })

    it('should handle quotes and special characters', async () => {
      const buffer = await createExcelBuffer({
        Special: [
          ['Text'],
          ['Hello, "World"'], // Comma and quotes
          ['Line\nBreak'], // Newline
        ],
      })

      const { results } = await processExcelBufferExcelJS(buffer)
      const csv = results[0].csvData

      expect(csv).toContain('"Hello, ""World"""')
      expect(csv).toContain('"Line\nBreak"')
    })

    it('should respect targetSheetName', async () => {
      const buffer = await createExcelBuffer({
        Sheet1: [['A'], [1]],
        Sheet2: [['B'], [2]],
        Sheet3: [['C'], [3]],
      })

      const { results, allSheetsCount } = await processExcelBufferExcelJS(buffer, 'Sheet2')
      
      expect(results).toHaveLength(1)
      expect(results[0].sheetName).toBe('Sheet2')
      expect(results[0].csvData).toContain('"B"')
      expect(allSheetsCount).toBe(3)
    })

    it('should filter out empty rows', async () => {
      const buffer = await createExcelBuffer({
        EmptyRows: [
          ['Header'],
          ['Row 1'],
          [null], // Empty
          [''],   // Empty string
          [undefined as any], // Undefined
          ['Row 2'],
        ],
      })

      const { results } = await processExcelBufferExcelJS(buffer)
      const csv = results[0].csvData
      
      // Should contain header and 2 data rows
      const lines = csv.split('\n')
      expect(lines.length).toBe(3)
      expect(lines[1]).toContain('"Row 1"')
      expect(lines[2]).toContain('"Row 2"')
    })
  })
})
