import { Router } from 'express'
import { z } from 'zod'
import { config } from '../../config'
import { db, getAll, getOne } from '../../db'
import { authRequired } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/error'
import { requirePermission } from '../../middleware/permission'
import { exportExcel, stampedName } from '../../utils/excel'
import { logOperation } from '../../utils/operationLog'
import { round2 } from '../../utils/billing'
import { AppError, ok, parsePageQuery } from '../../utils/response'
import { parseId, validateBody } from '../../utils/validate'
import {
  BILL_ITEM_LABEL,
  PAY_METHOD_LABEL,
  decorateBill,
  recalcBillPayable,
  syncBillPaidAmount,
  todayStr,
} from './service'

export const billRouter = Router()
billRouter.use(authRequired)

const BILL_STATUS_LABEL: Record<string, string> = {
  pending: '待收款',
  paid: '已收款',
  overdue: '逾期欠费',
  partial: '部分收款',
}

/** 构造账单筛选条件，列表与导出共用 */
function buildBillFilter(query: Record<string, unknown>) {
  const where: string[] = []
  const params: unknown[] = []

  const status = String(query.status ?? '').trim()
  if (status) {
    // 欠费口径：逾期 + 部分收款未结清
    if (status === 'unpaid') {
      where.push("b.status IN ('overdue','partial') AND b.payable_amount > b.paid_amount")
    } else {
      where.push('b.status = ?')
      params.push(status)
    }
  }

  const propertyType = String(query.property_type ?? '').trim()
  if (propertyType) {
    where.push('b.property_type = ?')
    params.push(propertyType)
  }

  const leaseId = Number(query.lease_id)
  if (Number.isFinite(leaseId) && leaseId > 0) {
    where.push('b.lease_id = ?')
    params.push(leaseId)
  }

  const tenantId = Number(query.tenant_id)
  if (Number.isFinite(tenantId) && tenantId > 0) {
    where.push('b.tenant_id = ?')
    params.push(tenantId)
  }

  const keyword = String(query.keyword ?? '').trim()
  if (keyword) {
    where.push('(b.bill_no LIKE ? OR l.lease_no LIKE ? OR t.name LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }

  const startDate = String(query.start_date ?? '').trim()
  if (startDate) {
    where.push('b.period_start >= ?')
    params.push(startDate)
  }
  const endDate = String(query.end_date ?? '').trim()
  if (endDate) {
    where.push('b.period_start <= ?')
    params.push(endDate)
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  }
}

const BASE_SELECT = `
  FROM bills b
  JOIN leases l ON l.id = b.lease_id
  JOIN tenants t ON t.id = b.tenant_id
`

// ==================== 账单台账 ====================

billRouter.get(
  '/',
  requirePermission('bill', 'view'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePageQuery(
      req.query as Record<string, unknown>,
      config.defaultPageSize,
      config.maxPageSize,
    )
    const { whereSql, params } = buildBillFilter(req.query as Record<string, unknown>)

    const total = db
      .prepare(`SELECT COUNT(*) AS c ${BASE_SELECT} ${whereSql}`)
      .get(...(params as never[])) as { c: number }

    const rows = getAll<Record<string, unknown>>(
      `SELECT b.*, l.lease_no, t.name AS tenant_name, t.phone AS tenant_phone,
              (SELECT GROUP_CONCAT(property_name, '、') FROM lease_items WHERE lease_id = b.lease_id) AS property_names,
              (SELECT COUNT(*) FROM payments WHERE bill_id = b.id) AS payment_count,
              CAST(julianday(date('now','localtime')) - julianday(b.due_date) AS INTEGER) AS overdue_days
       ${BASE_SELECT} ${whereSql}
       ORDER BY
         CASE WHEN b.payable_amount > b.paid_amount AND b.due_date < date('now','localtime') THEN 0 ELSE 1 END,
         b.due_date ASC, b.id ASC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    // 汇总与列表同口径，前端可直接展示"共应收 / 共实收"
    const totals = db
      .prepare(
        `SELECT COALESCE(SUM(b.payable_amount),0) AS payable,
                COALESCE(SUM(b.paid_amount),0) AS paid,
                COALESCE(SUM(b.decoration_deduction),0) AS deduction
         ${BASE_SELECT} ${whereSql}`,
      )
      .get(...(params as never[])) as { payable: number; paid: number; deduction: number }

    ok(res, {
      list: rows.map((r) => ({ ...decorateBill(r), status_label: BILL_STATUS_LABEL[String(r.status)] ?? '' })),
      total: total.c,
      page,
      pageSize,
      totals: {
        payable: round2(totals.payable),
        paid: round2(totals.paid),
        deduction: round2(totals.deduction),
        outstanding: round2(Math.max(totals.payable - totals.paid, 0)),
      },
    })
  }),
)

/** 欠费明细：一键查看所有未结清账单 */
billRouter.get('/arrears', requirePermission('bill', 'view'), (_req, res) => {
  const rows = getAll<Record<string, unknown>>(
    `SELECT b.*, l.lease_no, t.name AS tenant_name, t.phone AS tenant_phone,
            (SELECT GROUP_CONCAT(property_name, '、') FROM lease_items WHERE lease_id = b.lease_id) AS property_names,
            CAST(julianday(date('now','localtime')) - julianday(b.due_date) AS INTEGER) AS overdue_days
     ${BASE_SELECT}
     WHERE b.payable_amount > b.paid_amount AND b.due_date < date('now','localtime')
     ORDER BY b.due_date ASC`,
  )

  const totalOwed = round2(rows.reduce((s, r) => s + Number(r.payable_amount) - Number(r.paid_amount), 0))

  ok(res, {
    list: rows.map((r) => ({ ...decorateBill(r), status_label: BILL_STATUS_LABEL[String(r.status)] ?? '' })),
    total: rows.length,
    total_owed: totalOwed,
  })
})

/** 账单导出 */
billRouter.get(
  '/export',
  requirePermission('bill', 'export'),
  asyncHandler(async (req, res) => {
    const { whereSql, params } = buildBillFilter(req.query as Record<string, unknown>)

    const rows = getAll<Record<string, unknown>>(
      `SELECT b.*, l.lease_no, t.name AS tenant_name,
              (SELECT GROUP_CONCAT(property_name, '、') FROM lease_items WHERE lease_id = b.lease_id) AS property_names
       ${BASE_SELECT} ${whereSql} ORDER BY b.due_date`,
      params,
    )

    logOperation(req, 'bill', 'export', '账单台账', `导出 ${rows.length} 条`)

    await exportExcel(
      res,
      stampedName('账单台账'),
      '账单台账',
      [
        { header: '账单号', key: 'bill_no', width: 20 },
        { header: '租约号', key: 'lease_no', width: 16 },
        { header: '租客', key: 'tenant_name', width: 26 },
        { header: '业态', key: 'property_type', width: 10, value: (r) => (r.property_type === 'factory' ? '厂房' : '公寓') },
        { header: '关联房源', key: 'property_names', width: 36 },
        { header: '期次', key: 'period_index', width: 8 },
        { header: '账期开始', key: 'period_start', width: 13 },
        { header: '账期结束', key: 'period_end', width: 13 },
        { header: '应交日期', key: 'due_date', width: 13 },
        { header: '租金(元)', key: 'rent_amount', width: 14 },
        { header: '物业费(元)', key: 'property_fee', width: 13 },
        { header: '其他费用(元)', key: 'other_amount', width: 14 },
        { header: '装修抵扣(元)', key: 'decoration_deduction', width: 15 },
        { header: '应收(元)', key: 'payable_amount', width: 14 },
        { header: '实收(元)', key: 'paid_amount', width: 14 },
        { header: '欠费(元)', key: 'outstanding', width: 14, value: (r) => round2(Number(r.payable_amount) - Number(r.paid_amount)) },
        { header: '状态', key: 'status', width: 12, value: (r) => BILL_STATUS_LABEL[String(r.status)] ?? '' },
      ],
      rows,
    )
  }),
)

// ==================== 收款记录 ====================

billRouter.get('/payments', requirePermission('bill', 'view'), (req, res) => {
  const { page, pageSize, offset } = parsePageQuery(
    req.query as Record<string, unknown>,
    config.defaultPageSize,
    config.maxPageSize,
  )

  const where: string[] = []
  const params: unknown[] = []
  const keyword = String(req.query.keyword ?? '').trim()
  if (keyword) {
    where.push('(t.name LIKE ? OR b.bill_no LIKE ? OR p.remark LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }
  const method = String(req.query.method ?? '').trim()
  if (method) {
    where.push('p.method = ?')
    params.push(method)
  }
  const startDate = String(req.query.start_date ?? '').trim()
  if (startDate) {
    where.push('p.pay_date >= ?')
    params.push(startDate)
  }
  const endDate = String(req.query.end_date ?? '').trim()
  if (endDate) {
    where.push('p.pay_date <= ?')
    params.push(endDate)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const base = `FROM payments p
                JOIN bills b ON b.id = p.bill_id
                JOIN tenants t ON t.id = p.tenant_id`

  const total = db
    .prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(p.amount),0) AS sum ${base} ${whereSql}`)
    .get(...(params as never[])) as { c: number; sum: number }

  const list = getAll<Record<string, unknown>>(
    `SELECT p.*, b.bill_no, b.property_type, t.name AS tenant_name, l.lease_no
     ${base} JOIN leases l ON l.id = p.lease_id ${whereSql}
     ORDER BY p.pay_date DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  ok(res, {
    list: list.map((r) => ({ ...r, method_label: PAY_METHOD_LABEL[String(r.method)] ?? String(r.method) })),
    total: total.c,
    page,
    pageSize,
    total_amount: round2(total.sum),
  })
})

// ==================== 押金台账 ====================

billRouter.get('/deposits', requirePermission('bill', 'view'), (req, res) => {
  const rows = getAll<Record<string, unknown>>(
    `SELECT d.*, l.lease_no, t.name AS tenant_name, l.deposit_amount AS lease_deposit, l.status AS lease_status
       FROM deposit_records d
       JOIN leases l ON l.id = d.lease_id
       JOIN tenants t ON t.id = d.tenant_id
      ORDER BY d.happen_date DESC, d.id DESC`,
  )

  const summary = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'collect' THEN amount ELSE 0 END), 0) AS collected,
         COALESCE(SUM(CASE WHEN type = 'refund'  THEN amount ELSE 0 END), 0) AS refunded,
         COALESCE(SUM(CASE WHEN type = 'deduct'  THEN amount ELSE 0 END), 0) AS deducted
       FROM deposit_records`,
    )
    .get() as { collected: number; refunded: number; deducted: number }

  ok(res, {
    list: rows.map((r) => ({
      ...r,
      type_label: ({ collect: '收取', refund: '退还', deduct: '抵扣' } as Record<string, string>)[
        String(r.type)
      ] ?? '',
    })),
    summary: {
      collected: round2(summary.collected),
      refunded: round2(summary.refunded),
      deducted: round2(summary.deducted),
      /** 当前在管押金池 */
      holding: round2(summary.collected - summary.refunded - summary.deducted),
    },
  })
})

// ==================== 财务报表 ====================

/** 业态分离统计：厂房与公寓独立核算 */
billRouter.get('/reports', requirePermission('bill', 'view'), (req, res) => {
  const granularity = String(req.query.granularity ?? 'month') === 'year' ? 'year' : 'month'
  const startDate = String(req.query.start_date ?? `${new Date().getFullYear()}-01-01`)
  const endDate = String(req.query.end_date ?? todayStr())
  const bucket = granularity === 'year' ? "substr(b.period_start, 1, 4)" : "substr(b.period_start, 1, 7)"

  const rows = getAll<{
    bucket: string
    property_type: string
    payable: number
    paid: number
    deduction: number
    other: number
  }>(
    `SELECT ${bucket} AS bucket, b.property_type,
            COALESCE(SUM(b.payable_amount),0) AS payable,
            COALESCE(SUM(b.paid_amount),0) AS paid,
            COALESCE(SUM(b.decoration_deduction),0) AS deduction,
            COALESCE(SUM(b.other_amount),0) AS other
       FROM bills b
      WHERE b.period_start >= ? AND b.period_start <= ?
      GROUP BY bucket, b.property_type
      ORDER BY bucket`,
    [startDate, endDate],
  )

  const buckets = Array.from(new Set(rows.map((r) => r.bucket))).sort()

  const series = buckets.map((b) => {
    const factory = rows.find((r) => r.bucket === b && r.property_type === 'factory')
    const apartment = rows.find((r) => r.bucket === b && r.property_type === 'apartment')

    const payable = round2((factory?.payable ?? 0) + (apartment?.payable ?? 0))
    const paid = round2((factory?.paid ?? 0) + (apartment?.paid ?? 0))
    const deduction = round2((factory?.deduction ?? 0) + (apartment?.deduction ?? 0))
    const other = round2((factory?.other ?? 0) + (apartment?.other ?? 0))

    return {
      bucket: b,
      factory_payable: round2(factory?.payable ?? 0),
      factory_paid: round2(factory?.paid ?? 0),
      factory_deduction: round2(factory?.deduction ?? 0),
      apartment_payable: round2(apartment?.payable ?? 0),
      apartment_paid: round2(apartment?.paid ?? 0),
      apartment_deduction: round2(apartment?.deduction ?? 0),
      payable,
      paid,
      deduction,
      other,
      outstanding: round2(Math.max(payable - paid, 0)),
    }
  })

  const total = series.reduce(
    (acc, s) => ({
      payable: round2(acc.payable + s.payable),
      paid: round2(acc.paid + s.paid),
      deduction: round2(acc.deduction + s.deduction),
      other: round2(acc.other + s.other),
      outstanding: round2(acc.outstanding + s.outstanding),
    }),
    { payable: 0, paid: 0, deduction: 0, other: 0, outstanding: 0 },
  )

  ok(res, {
    granularity,
    start_date: startDate,
    end_date: endDate,
    series,
    total: {
      ...total,
      factory_payable: round2(series.reduce((s, x) => s + x.factory_payable, 0)),
      factory_paid: round2(series.reduce((s, x) => s + x.factory_paid, 0)),
      factory_deduction: round2(series.reduce((s, x) => s + x.factory_deduction, 0)),
      apartment_payable: round2(series.reduce((s, x) => s + x.apartment_payable, 0)),
      apartment_paid: round2(series.reduce((s, x) => s + x.apartment_paid, 0)),
      apartment_deduction: round2(series.reduce((s, x) => s + x.apartment_deduction, 0)),
    },
  })
})

/** 报表导出 */
billRouter.get(
  '/reports/export',
  requirePermission('bill', 'export'),
  asyncHandler(async (req, res) => {
    const granularity = String(req.query.granularity ?? 'month') === 'year' ? 'year' : 'month'
    const startDate = String(req.query.start_date ?? `${new Date().getFullYear()}-01-01`)
    const endDate = String(req.query.end_date ?? todayStr())
    const bucket = granularity === 'year' ? "substr(b.period_start, 1, 4)" : "substr(b.period_start, 1, 7)"

    const rows = getAll<Record<string, unknown>>(
      `SELECT ${bucket} AS bucket, b.property_type,
              COALESCE(SUM(b.payable_amount),0) AS payable,
              COALESCE(SUM(b.paid_amount),0) AS paid,
              COALESCE(SUM(b.decoration_deduction),0) AS deduction
         FROM bills b
        WHERE b.period_start >= ? AND b.period_start <= ?
        GROUP BY bucket, b.property_type ORDER BY bucket`,
      [startDate, endDate],
    )

    logOperation(req, 'bill', 'export', '财务报表', `区间 ${startDate} ~ ${endDate}`)

    await exportExcel(
      res,
      stampedName(`财务报表_${granularity === 'year' ? '年度' : '月度'}`),
      '财务报表',
      [
        { header: granularity === 'year' ? '年度' : '月份', key: 'bucket', width: 12 },
        { header: '业态', key: 'property_type', width: 10, value: (r) => (r.property_type === 'factory' ? '厂房' : '公寓') },
        { header: '应收总额(元)', key: 'payable', width: 16 },
        { header: '实收总额(元)', key: 'paid', width: 16 },
        { header: '装修抵扣(元)', key: 'deduction', width: 16 },
        { header: '欠费(元)', key: 'owed', width: 16, value: (r) => round2(Number(r.payable) - Number(r.paid)) },
      ],
      rows,
    )
  }),
)

// ==================== 账单详情与操作 ====================

billRouter.get(
  '/:id',
  requirePermission('bill', 'view'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '账单 ID')

    const bill = getOne<Record<string, unknown>>(
      `SELECT b.*, l.lease_no, l.start_date AS lease_start, l.end_date AS lease_end,
              t.name AS tenant_name, t.phone AS tenant_phone,
              (SELECT GROUP_CONCAT(property_name, '、') FROM lease_items WHERE lease_id = b.lease_id) AS property_names
       ${BASE_SELECT} WHERE b.id = ?`,
      [id],
    )
    if (!bill) throw AppError.notFound('账单不存在')

    const items = getAll<Record<string, unknown>>(
      'SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id',
      [id],
    )

    const payments = getAll<Record<string, unknown>>(
      'SELECT * FROM payments WHERE bill_id = ? ORDER BY pay_date, id',
      [id],
    )

    ok(res, {
      bill: { ...decorateBill(bill), status_label: BILL_STATUS_LABEL[String(bill.status)] ?? '' },
      items: items.map((i) => ({ ...i, type_label: BILL_ITEM_LABEL[String(i.type)] ?? String(i.type) })),
      payments: payments.map((p) => ({
        ...p,
        method_label: PAY_METHOD_LABEL[String(p.method)] ?? String(p.method),
      })),
    })
  }),
)

/** 手动追加费用：水电费、车位费、违约金等 */
const addItemSchema = z.object({
  type: z.enum(['water', 'electric', 'parking', 'penalty', 'other']),
  name: z.string().optional(),
  amount: z.coerce.number().refine((v) => v !== 0, '金额不能为 0'),
  remark: z.string().nullish(),
})

billRouter.post(
  '/:id/items',
  requirePermission('bill', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '账单 ID')
    if (!getOne('SELECT id FROM bills WHERE id = ?', [id])) throw AppError.notFound('账单不存在')

    const data = validateBody(addItemSchema, req.body)
    const name = data.name?.trim() || BILL_ITEM_LABEL[data.type] || '其他费用'

    db.prepare('INSERT INTO bill_items (bill_id, type, name, amount, remark) VALUES (?, ?, ?, ?, ?)').run(
      id,
      data.type,
      name,
      data.amount,
      data.remark ?? null,
    )

    const { payable } = recalcBillPayable(id)

    logOperation(req, 'bill', 'edit', `账单 ${id}`, `追加费用「${name}」${data.amount} 元`)
    ok(res, { success: true, payable })
  }),
)

billRouter.delete(
  '/items/:itemId',
  requirePermission('bill', 'edit'),
  asyncHandler(async (req, res) => {
    const itemId = parseId(req.params.itemId, '费用项 ID')
    const item = getOne<{ bill_id: number; type: string; name: string }>(
      'SELECT bill_id, type, name FROM bill_items WHERE id = ?',
      [itemId],
    )
    if (!item) throw AppError.notFound('费用项不存在')
    if (['rent', 'property', 'deduction'].includes(item.type)) {
      throw AppError.badRequest('租金、物业费与装修抵扣由租约自动生成，不能单独删除')
    }

    db.prepare('DELETE FROM bill_items WHERE id = ?').run(itemId)
    const { payable } = recalcBillPayable(item.bill_id)

    logOperation(req, 'bill', 'edit', `账单 ${item.bill_id}`, `删除费用项「${item.name}」`)
    ok(res, { success: true, payable })
  }),
)

/** 登记收款：支持全额与部分收款 */
const paymentSchema = z.object({
  amount: z.coerce.number().positive('收款金额必须大于 0'),
  pay_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请选择收款日期'),
  method: z.enum(['transfer', 'cash', 'wechat', 'alipay', 'check']).default('transfer'),
  remark: z.string().nullish(),
})

billRouter.post(
  '/:id/payments',
  requirePermission('bill', 'create'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '账单 ID')

    const bill = getOne<{ bill_no: string; lease_id: number; tenant_id: number; payable_amount: number; paid_amount: number }>(
      'SELECT bill_no, lease_id, tenant_id, payable_amount, paid_amount FROM bills WHERE id = ?',
      [id],
    )
    if (!bill) throw AppError.notFound('账单不存在')

    const data = validateBody(paymentSchema, req.body)
    const outstanding = round2(bill.payable_amount - bill.paid_amount)

    if (outstanding <= 0) throw AppError.conflict('该账单已结清，无需再登记收款')
    if (data.amount > outstanding) {
      throw AppError.badRequest(`收款金额超出欠费金额（当前欠费 ${outstanding} 元）`)
    }

    db.prepare(
      `INSERT INTO payments (bill_id, lease_id, tenant_id, amount, pay_date, method, operator, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      bill.lease_id,
      bill.tenant_id,
      data.amount,
      data.pay_date,
      data.method,
      req.user!.realName,
      data.remark ?? null,
    )

    syncBillPaidAmount(id)

    const after = getOne<{ paid_amount: number; status: string }>(
      'SELECT paid_amount, status FROM bills WHERE id = ?',
      [id],
    )

    logOperation(
      req,
      'bill',
      'create',
      bill.bill_no,
      `登记收款 ${data.amount} 元（${PAY_METHOD_LABEL[data.method]}）`,
    )

    ok(res, {
      success: true,
      paid_amount: after?.paid_amount ?? 0,
      status: after?.status ?? '',
      outstanding: round2(Math.max(bill.payable_amount - (after?.paid_amount ?? 0), 0)),
    })
  }),
)

/** 撤销收款记录（登记错误时使用） */
billRouter.delete(
  '/payments/:paymentId',
  requirePermission('bill', 'edit'),
  asyncHandler(async (req, res) => {
    const paymentId = parseId(req.params.paymentId, '收款记录 ID')
    const payment = getOne<{ bill_id: number; amount: number }>(
      'SELECT bill_id, amount FROM payments WHERE id = ?',
      [paymentId],
    )
    if (!payment) throw AppError.notFound('收款记录不存在')

    db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId)
    syncBillPaidAmount(payment.bill_id)

    logOperation(req, 'bill', 'delete', `收款记录 ${paymentId}`, `撤销收款 ${payment.amount} 元`)
    ok(res, { success: true })
  }),
)
