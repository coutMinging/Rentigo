import type { Response } from 'express'
import ExcelJS from 'exceljs'

export interface ExcelColumn<T> {
  header: string
  key: string
  width?: number
  /** 自定义取值，缺省直接取 row[key] */
  value?: (row: T) => string | number | null | undefined
}

/**
 * 通用 Excel 导出。
 * 前端拿到的是真实 xlsx 二进制流，可直接用于财务对账与记账。
 */
export async function exportExcel<T extends Record<string, unknown>>(
  res: Response,
  fileBaseName: string,
  sheetName: string,
  columns: ExcelColumn<T>[],
  rows: T[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '厂房及公寓楼出租管理系统'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetName)
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 16,
  }))

  // 表头样式：浅灰底 + 加粗，贴合报表阅读习惯
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, size: 11 }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F4F8' },
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9DEE8' } },
      left: { style: 'thin', color: { argb: 'FFD9DEE8' } },
      bottom: { style: 'thin', color: { argb: 'FFD9DEE8' } },
      right: { style: 'thin', color: { argb: 'FFD9DEE8' } },
    }
  })

  for (const row of rows) {
    const values: Record<string, string | number | null> = {}
    for (const col of columns) {
      const raw = col.value ? col.value(row) : (row[col.key] as string | number | null | undefined)
      values[col.key] = raw ?? ''
    }
    sheet.addRow(values)
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  }

  const fileName = `${fileBaseName}.xlsx`
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  // 同时给出 ASCII 与 UTF-8 两种文件名，兼容各浏览器
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  )

  await workbook.xlsx.write(res)
  res.end()
}

/** 生成带时间戳的文件名前缀，避免重复下载互相覆盖 */
export function stampedName(prefix: string): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${prefix}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`
}
