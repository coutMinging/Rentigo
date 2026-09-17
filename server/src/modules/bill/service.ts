import { db } from '../../db'

export type BillStatus = 'pending' | 'paid' | 'overdue' | 'partial'

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayStr(): string {
  return toStr(new Date())
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toStr(d)
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * 账单状态推导规则（四个状态是需求明确要求的）：
 *   应付 ≤ 0 或 已收 ≥ 应付   → 已收款
 *   0 < 已收 < 应付          → 部分收款
 *   已收 = 0 且 已过应交日期  → 逾期欠费
 *   其余                     → 待收款
 * 部分收款的账单是否逾期，由前端结合 is_overdue 字段额外高亮。
 */
export function computeBillStatus(payable: number, paid: number, dueDate: string): BillStatus {
  if (payable <= 0) return 'paid'
  if (paid >= payable) return 'paid'
  if (paid > 0) return 'partial'
  return dueDate < todayStr() ? 'overdue' : 'pending'
}

/** 重算并写回账单状态 */
export function refreshBillStatus(billId: number): void {
  const bill = db
    .prepare('SELECT payable_amount, paid_amount, due_date FROM bills WHERE id = ?')
    .get(billId) as { payable_amount: number; paid_amount: number; due_date: string } | undefined
  if (!bill) return

  const status = computeBillStatus(bill.payable_amount, bill.paid_amount, bill.due_date)
  db.prepare("UPDATE bills SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
    status,
    billId,
  )
}

/** 依据收款流水重算账单已收金额，再刷新状态 */
export function syncBillPaidAmount(billId: number): void {
  const row = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE bill_id = ?')
    .get(billId) as { paid: number }

  db.prepare('UPDATE bills SET paid_amount = ? WHERE id = ?').run(round2(row.paid), billId)
  refreshBillStatus(billId)
}

/** 追加费用项后重算账单应付金额与状态 */
export function recalcBillPayable(billId: number): { payable: number } {
  const bill = db
    .prepare('SELECT rent_amount, property_fee, decoration_deduction FROM bills WHERE id = ?')
    .get(billId) as
    | { rent_amount: number; property_fee: number; decoration_deduction: number }
    | undefined

  if (!bill) return { payable: 0 }

  // 手工追加的费用项（水电、车位、违约金等），抵扣项金额存的是负数
  const extra = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM bill_items
        WHERE bill_id = ? AND type NOT IN ('rent','property','deduction')`,
    )
    .get(billId) as { s: number }

  const otherAmount = round2(extra.s)
  const payable = round2(bill.rent_amount + bill.property_fee + otherAmount - bill.decoration_deduction)

  db.prepare(
    `UPDATE bills SET other_amount = ?, payable_amount = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
  ).run(otherAmount, payable < 0 ? 0 : payable, billId)

  refreshBillStatus(billId)
  return { payable: payable < 0 ? 0 : payable }
}

/** 账单查询时统一补齐派生字段 */
export function decorateBill<T extends Record<string, unknown>>(row: T): T & {
  outstanding: number
  is_overdue: boolean
} {
  const payable = Number(row.payable_amount ?? 0)
  const paid = Number(row.paid_amount ?? 0)
  const dueDate = String(row.due_date ?? '')
  const outstanding = round2(Math.max(payable - paid, 0))

  return {
    ...row,
    outstanding,
    is_overdue: payable > paid && dueDate < todayStr(),
  }
}

/** 账单费用明细类型的中文名 */
export const BILL_ITEM_LABEL: Record<string, string> = {
  rent: '租金',
  property: '物业费',
  water: '水费',
  electric: '电费',
  parking: '车位费',
  penalty: '违约金',
  deduction: '装修费抵扣',
  other: '其他费用',
}

export const PAY_METHOD_LABEL: Record<string, string> = {
  transfer: '银行转账',
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  check: '支票',
}
