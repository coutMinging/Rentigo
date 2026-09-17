import { config } from '../../config'
import { db, getAll, getOne } from '../../db'
import { buildBillPlan, round2, summarizePlan, type PayCycle } from '../../utils/billing'
import { makeBillNo, makeLeaseNo } from '../../utils/id'
import { AppError } from '../../utils/response'
import { addDays, computeBillStatus, todayStr } from '../bill/service'

/** 租约状态的中文标签 */
export const LEASE_STATUS_LABEL: Record<string, string> = {
  active: '正常履约',
  expiring: '即将到期',
  expired: '已到期',
  terminated: '已退租',
  breach: '解约欠费',
}

export const PAY_CYCLE_LABEL: Record<PayCycle, string> = {
  month: '月付',
  quarter: '季付',
  year: '年付',
}

/** 根据结束日期推导租约状态（未退租的前提下） */
export function deriveLeaseStatus(endDate: string, warnDays = config.leaseWarnDays): string {
  const today = todayStr()
  if (endDate < today) return 'expired'
  if (endDate <= addDays(today, warnDays)) return 'expiring'
  return 'active'
}

/** 租约关联的房源，从数据库读取权威参数计算金额 */
export interface PropertyPick {
  property_type: 'factory' | 'apartment'
  property_id: number
}

export interface ResolvedItem {
  property_type: 'factory' | 'apartment'
  property_id: number
  property_name: string
  monthly_rent: number
  monthly_property_fee: number
}

/**
 * 由房源反查租金与物业费。
 * 金额一律服务端计算，不信任前端传值——否则改租金就能改账单，是明显的账务漏洞。
 */
export function resolvePropertyItems(picks: PropertyPick[]): ResolvedItem[] {
  const items: ResolvedItem[] = []

  for (const pick of picks) {
    if (pick.property_type === 'factory') {
      const row = getOne<{
        id: number
        name: string
        total_area: number
        rent_price: number
        property_fee: number
        status: string
      }>('SELECT id, name, total_area, rent_price, property_fee, status FROM factories WHERE id = ?', [
        pick.property_id,
      ])
      if (!row) throw AppError.badRequest(`厂房房源 ${pick.property_id} 不存在`)
      if (row.status === 'disabled') throw AppError.badRequest(`厂房「${row.name}」已停用，无法签约`)

      items.push({
        property_type: 'factory',
        property_id: row.id,
        property_name: row.name,
        monthly_rent: round2(row.total_area * row.rent_price),
        monthly_property_fee: round2(row.total_area * row.property_fee),
      })
    } else {
      const row = getOne<{
        id: number
        code: string
        room_no: string
        monthly_rent: number
        property_fee: number
        status: string
      }>('SELECT id, code, room_no, monthly_rent, property_fee, status FROM apartments WHERE id = ?', [
        pick.property_id,
      ])
      if (!row) throw AppError.badRequest(`公寓房间 ${pick.property_id} 不存在`)
      if (row.status === 'repair') throw AppError.badRequest(`房间 ${row.code} 待维修，无法签约`)

      items.push({
        property_type: 'apartment',
        property_id: row.id,
        property_name: `${row.code} 房间`,
        monthly_rent: round2(row.monthly_rent),
        monthly_property_fee: round2(row.property_fee),
      })
    }
  }

  if (items.length === 0) throw AppError.badRequest('请至少关联一个房源')

  return items
}

/** 校验所选房源在当前租期内没有被其他生效租约占用 */
export function assertPropertiesAvailable(picks: PropertyPick[], excludeLeaseId?: number): void {
  for (const pick of picks) {
    const conflict = getOne<{ lease_no: string; end_date: string }>(
      `SELECT l.lease_no, l.end_date
         FROM lease_items li JOIN leases l ON l.id = li.lease_id
        WHERE li.property_type = ? AND li.property_id = ?
          AND l.status IN ('active','expiring')
          AND l.id != ?
        LIMIT 1`,
      [pick.property_type, pick.property_id, excludeLeaseId ?? 0],
    )

    if (conflict) {
      throw AppError.conflict(
        `该房源已被租约 ${conflict.lease_no} 占用（到期日 ${conflict.end_date}），请先处理原租约`,
      )
    }
  }
}

/** 生成租约号：取当月已有数量 +1 */
export function nextLeaseNo(): string {
  const prefix = `HT${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM leases WHERE lease_no LIKE ?')
    .get(`${prefix}%`) as { c: number }
  return makeLeaseNo(row.c + 1)
}

export interface BillPlanParams {
  leaseId: number
  leaseNo: string
  tenantId: number
  propertyType: 'factory' | 'apartment'
  startDate: string
  endDate: string
  payCycle: PayCycle
  monthlyRent: number
  monthlyPropertyFee: number
  decorationTotal: number
  decorationPeriods: number
  decorationPerMonth: number
}

/**
 * 批量生成账单并落库。
 * 账单必须落库而不是实时计算：收款流水、部分收款、逾期与统计
 * 都需要挂在具体账单记录上，实时算无法承载流水归属。
 */
export function generateBills(params: BillPlanParams): { count: number; totalDeduction: number } {
  const plan = buildBillPlan({
    startDate: params.startDate,
    endDate: params.endDate,
    payCycle: params.payCycle,
    monthlyRent: params.monthlyRent,
    monthlyPropertyFee: params.monthlyPropertyFee,
    decorationTotal: params.decorationTotal,
    decorationPeriods: params.decorationPeriods,
    decorationPerMonth: params.decorationPerMonth,
  })

  // 重新生成前先清空旧账单（级联会一并删除明细与收款流水）
  db.prepare('DELETE FROM bills WHERE lease_id = ?').run(params.leaseId)

  const insertBill = db.prepare(`
    INSERT INTO bills (
      bill_no, lease_id, tenant_id, property_type, period_index,
      period_start, period_end, due_date,
      rent_amount, property_fee, other_amount, decoration_deduction, payable_amount,
      paid_amount, status, remark
    ) VALUES (
      @billNo, @leaseId, @tenantId, @propertyType, @periodIndex,
      @periodStart, @periodEnd, @dueDate,
      @rentAmount, @propertyFee, 0, @decorationDeduction, @payableAmount,
      0, @status, NULL
    )
  `)

  const insertItem = db.prepare(
    'INSERT INTO bill_items (bill_id, type, name, amount) VALUES (?, ?, ?, ?)',
  )

  let totalDeduction = 0

  const run = db.transaction(() => {
    for (const period of plan) {
      const status = computeBillStatus(period.payableAmount, 0, period.dueDate)

      const billId = Number(
        insertBill.run({
          billNo: makeBillNo(params.leaseNo, period.periodIndex),
          leaseId: params.leaseId,
          tenantId: params.tenantId,
          propertyType: params.propertyType,
          periodIndex: period.periodIndex,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          dueDate: period.dueDate,
          rentAmount: period.rentAmount,
          propertyFee: period.propertyFee,
          decorationDeduction: period.decorationDeduction,
          payableAmount: period.payableAmount,
          status,
        }).lastInsertRowid,
      )

      insertItem.run(billId, 'rent', '租金', period.rentAmount)
      if (period.propertyFee > 0) {
        insertItem.run(billId, 'property', '物业费', period.propertyFee)
      }
      if (period.decorationDeduction > 0) {
        insertItem.run(billId, 'deduction', '装修费抵扣', -period.decorationDeduction)
      }

      totalDeduction = round2(totalDeduction + period.decorationDeduction)
    }

    db.prepare("UPDATE leases SET decoration_deducted = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
      totalDeduction,
      params.leaseId,
    )
  })

  run()

  return { count: plan.length, totalDeduction }
}

/** 试算预览：不落库，供新建租约表单实时显示每期应付 */
export function previewPlan(input: {
  startDate: string
  endDate: string
  payCycle: PayCycle
  picks: PropertyPick[]
  decorationTotal: number
  decorationPeriods: number
  decorationPerMonth?: number
}) {
  const items = resolvePropertyItems(input.picks)
  const monthlyRent = round2(items.reduce((s, i) => s + i.monthly_rent, 0))
  const monthlyPropertyFee = round2(items.reduce((s, i) => s + i.monthly_property_fee, 0))

  const perPeriod =
    input.decorationPerMonth && input.decorationPerMonth > 0
      ? round2(input.decorationPerMonth)
      : input.decorationPeriods > 0
        ? round2(input.decorationTotal / input.decorationPeriods)
        : 0

  const plan = buildBillPlan({
    startDate: input.startDate,
    endDate: input.endDate,
    payCycle: input.payCycle,
    monthlyRent,
    monthlyPropertyFee,
    decorationTotal: input.decorationTotal,
    decorationPeriods: input.decorationPeriods,
    decorationPerMonth: perPeriod,
  })

  return {
    items,
    monthlyRent,
    monthlyPropertyFee,
    decorationPerMonth: perPeriod,
    plan,
    summary: summarizePlan(plan, input.decorationTotal),
  }
}

/** 房源占用状态同步：有生效租约 → 已出租，否则回到空置 */
export function syncPropertyStatusOf(items: Array<{ property_type: string; property_id: number }>): void {
  for (const item of items) {
    const stillLeased = getOne(
      `SELECT 1 AS ok FROM lease_items li JOIN leases l ON l.id = li.lease_id
        WHERE li.property_type = ? AND li.property_id = ?
          AND l.status IN ('active','expiring') LIMIT 1`,
      [item.property_type, item.property_id],
    )

    const table = item.property_type === 'factory' ? 'factories' : 'apartments'
    // 停用/待维修的房源保持原状态，不被租约覆盖
    const guard = item.property_type === 'factory' ? "AND status != 'disabled'" : "AND status != 'repair'"
    const nextStatus = stillLeased ? 'rented' : 'vacant'

    db.prepare(`UPDATE ${table} SET status = ? WHERE id = ? ${guard}`).run(nextStatus, item.property_id)
  }
}

/** 同步某份租约涉及的全部房源状态 */
export function syncPropertyStatusByLease(leaseId: number): void {
  const items = getAll<{ property_type: string; property_id: number }>(
    'SELECT property_type, property_id FROM lease_items WHERE lease_id = ?',
    [leaseId],
  )
  syncPropertyStatusOf(items)
}

// ==================== 退租结算 ====================

export interface SettlementInput {
  terminate_date: string
  water_fee: number
  electric_fee: number
  other_fee: number
  /** 押金是否用于抵扣欠费 */
  deposit_offset: boolean
  remark?: string | null
}

export interface SettlementResult {
  lease_id: number
  lease_no: string
  tenant_name: string
  property_names: string[]
  terminate_date: string
  deposit_amount: number
  decoration_total: number
  decoration_deducted: number
  decoration_remainder: number
  unpaid_bills: Array<{ bill_no: string; due_date: string; outstanding: number; status: string }>
  unpaid_total: number
  water_fee: number
  electric_fee: number
  other_fee: number
  total_deduction: number
  /** 应退押金（正数表示退给租客） */
  refund_amount: number
  /** 租客应补金额（正数表示还需向租客收取） */
  payable_amount: number
}

/** 退租结算试算：押金抵扣、水电结算、剩余租金核算 */
export function buildSettlement(leaseId: number, input: SettlementInput): SettlementResult {
  const lease = getOne<{
    id: number
    lease_no: string
    tenant_id: number
    property_type: string
    end_date: string
    deposit_amount: number
    decoration_total: number
    decoration_deducted: number
    monthly_rent: number
    status: string
  }>(`SELECT id, lease_no, tenant_id, property_type, end_date, deposit_amount,
             decoration_total, decoration_deducted, monthly_rent, status
        FROM leases WHERE id = ?`, [leaseId])

  if (!lease) throw AppError.notFound('租约不存在')
  if (lease.status === 'terminated') throw AppError.conflict('该租约已退租，无需重复结算')

  const tenant = getOne<{ name: string }>('SELECT name FROM tenants WHERE id = ?', [lease.tenant_id])
  const items = getAll<{ property_name: string }>(
    'SELECT property_name FROM lease_items WHERE lease_id = ?',
    [leaseId],
  )

  // 截止退租日仍未结清的账单
  const unpaidRows = getAll<{
    bill_no: string
    due_date: string
    payable_amount: number
    paid_amount: number
    status: string
  }>(
    `SELECT bill_no, due_date, payable_amount, paid_amount, status
       FROM bills
      WHERE lease_id = ? AND due_date <= ? AND payable_amount > paid_amount
      ORDER BY due_date`,
    [leaseId, input.terminate_date],
  )

  const unpaidBills = unpaidRows.map((r) => ({
    bill_no: r.bill_no,
    due_date: r.due_date,
    outstanding: round2(r.payable_amount - r.paid_amount),
    status: r.status,
  }))

  const unpaidTotal = round2(unpaidBills.reduce((s, b) => s + b.outstanding, 0))
  const waterFee = round2(input.water_fee)
  const electricFee = round2(input.electric_fee)
  const otherFee = round2(input.other_fee)

  // 押金可抵扣：欠费 + 水电 + 其他
  const deductionCandidates = round2(unpaidTotal + waterFee + electricFee + otherFee)
  const deposit = round2(lease.deposit_amount)

  const totalDeduction = input.deposit_offset
    ? round2(Math.min(deposit, deductionCandidates))
    : 0

  const remainAfterDeposit = round2(deductionCandidates - totalDeduction)
  const refundAmount = input.deposit_offset ? round2(Math.max(deposit - deductionCandidates, 0)) : deposit

  const decorationRemainder = round2(Math.max(lease.decoration_total - lease.decoration_deducted, 0))

  return {
    lease_id: lease.id,
    lease_no: lease.lease_no,
    tenant_name: tenant?.name ?? '',
    property_names: items.map((i) => i.property_name),
    terminate_date: input.terminate_date,
    deposit_amount: deposit,
    decoration_total: round2(lease.decoration_total),
    decoration_deducted: round2(lease.decoration_deducted),
    decoration_remainder: decorationRemainder,
    unpaid_bills: unpaidBills,
    unpaid_total: unpaidTotal,
    water_fee: waterFee,
    electric_fee: electricFee,
    other_fee: otherFee,
    total_deduction: totalDeduction,
    refund_amount: refundAmount,
    payable_amount: input.deposit_offset ? remainAfterDeposit : deductionCandidates,
  }
}

/** 确认退租：写入结算单、押金台账、解除房源占用 */
export function commitTermination(leaseId: number, input: SettlementInput, operator: string): SettlementResult {
  const result = buildSettlement(leaseId, input)
  const lease = getOne<{ tenant_id: number }>('SELECT tenant_id FROM leases WHERE id = ?', [leaseId])!
  const today = todayStr()

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE leases
          SET status = 'terminated', terminate_date = ?, terminate_reason = ?,
              updated_at = datetime('now','localtime')
        WHERE id = ?`,
    ).run(input.terminate_date, input.remark ?? '租客退租', leaseId)

    const insertDeposit = db.prepare(
      `INSERT INTO deposit_records (lease_id, tenant_id, type, amount, happen_date, remark, operator)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )

    if (result.total_deduction > 0) {
      insertDeposit.run(
        leaseId,
        lease.tenant_id,
        'deduct',
        result.total_deduction,
        input.terminate_date,
        `抵扣欠费与水电费（欠费 ${result.unpaid_total} + 水电 ${round2(result.water_fee + result.electric_fee)} + 其他 ${result.other_fee}）`,
        operator,
      )
    }

    if (result.refund_amount > 0) {
      insertDeposit.run(
        leaseId,
        lease.tenant_id,
        'refund',
        result.refund_amount,
        input.terminate_date,
        '退租退还押金',
        operator,
      )
    }

    // 若有未结清账单，标记为解约欠费来源
    if (result.payable_amount > 0) {
      console.log(
        `[lease] 租约 ${leaseId} 退租后租客仍需补交 ${result.payable_amount} 元，请通过账单或线下方式收取`,
      )
    }
  })

  run()

  syncPropertyStatusByLease(leaseId)
  void today
  return result
}
