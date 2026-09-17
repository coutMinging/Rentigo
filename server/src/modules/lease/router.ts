import { Router } from 'express'
import { z } from 'zod'
import { config } from '../../config'
import { db, getAll, getOne } from '../../db'
import { authRequired } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/error'
import { requirePermission } from '../../middleware/permission'
import { renderContract, type ContractContext, type ContractKind } from '../../utils/contract'
import { exportExcel, stampedName } from '../../utils/excel'
import { logOperation } from '../../utils/operationLog'
import { round2 } from '../../utils/billing'
import { AppError, ok, parsePageQuery } from '../../utils/response'
import { emptyToNull, parseId, toSqlParams, validateBody } from '../../utils/validate'

/** 编辑租约时参与更新的列名 */
const LEASE_UPDATE_COLUMNS = [
  'start_date',
  'end_date',
  'pay_cycle',
  'deposit_amount',
  'decoration_total',
  'decoration_periods',
  'extra_clause',
  'sign_date',
  'remark',
] as const
import { decorateBill } from '../bill/service'
import * as svc from './service'

export const leaseRouter = Router()
leaseRouter.use(authRequired)

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')

const createSchema = z
  .object({
    tenant_id: z.coerce.number().int().positive('请选择租客'),
    property_type: z.enum(['factory', 'apartment']),
    properties: z.array(z.coerce.number().int().positive()).min(1, '请至少关联一个房源'),
    start_date: dateStr,
    end_date: dateStr,
    pay_cycle: z.enum(['month', 'quarter', 'year']),
    deposit_amount: z.coerce.number().nonnegative().default(0),
    decoration_total: z.coerce.number().nonnegative().default(0),
    decoration_periods: z.coerce.number().int().nonnegative().default(0),
    decoration_per_month: z.coerce.number().nonnegative().default(0),
    sign_date: dateStr.nullish(),
    extra_clause: z.string().nullish(),
    remark: z.string().nullish(),
  })
  .refine((v) => v.end_date > v.start_date, { message: '租期结束日期必须晚于开始日期', path: ['end_date'] })
  .refine((v) => v.decoration_periods === 0 || v.decoration_total > 0, {
    message: '填写了抵扣期数就必须填写装修总金额',
    path: ['decoration_total'],
  })

const previewSchema = z.object({
  property_type: z.enum(['factory', 'apartment']),
  properties: z.array(z.coerce.number().int().positive()).default([]),
  start_date: dateStr,
  end_date: dateStr,
  pay_cycle: z.enum(['month', 'quarter', 'year']),
  decoration_total: z.coerce.number().nonnegative().default(0),
  decoration_periods: z.coerce.number().int().nonnegative().default(0),
  decoration_per_month: z.coerce.number().nonnegative().default(0),
})

const settlementSchema = z.object({
  terminate_date: dateStr,
  water_fee: z.coerce.number().nonnegative().default(0),
  electric_fee: z.coerce.number().nonnegative().default(0),
  other_fee: z.coerce.number().nonnegative().default(0),
  deposit_offset: z.coerce.boolean().default(true),
  remark: z.string().nullish(),
})

// ==================== 列表 ====================

leaseRouter.get(
  '/',
  requirePermission('lease', 'view'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePageQuery(
      req.query as Record<string, unknown>,
      config.defaultPageSize,
      config.maxPageSize,
    )

    const where: string[] = []
    const params: unknown[] = []

    const status = String(req.query.status ?? '').trim()
    if (status) {
      where.push('l.status = ?')
      params.push(status)
    }
    const propertyType = String(req.query.property_type ?? '').trim()
    if (propertyType) {
      where.push('l.property_type = ?')
      params.push(propertyType)
    }
    const tenantId = Number(req.query.tenant_id)
    if (Number.isFinite(tenantId) && tenantId > 0) {
      where.push('l.tenant_id = ?')
      params.push(tenantId)
    }
    const keyword = String(req.query.keyword ?? '').trim()
    if (keyword) {
      where.push('(l.lease_no LIKE ? OR t.name LIKE ? OR t.phone LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    }
    // 到期预警：只看 N 天内到期且仍在履约的租约
    if (req.query.expiring === '1') {
      where.push("l.status = 'expiring'")
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM leases l JOIN tenants t ON t.id = l.tenant_id ${whereSql}`)
      .get(...(params as never[])) as { c: number }

    const list = getAll<Record<string, unknown>>(
      `SELECT l.*, t.name AS tenant_name, t.phone AS tenant_phone, t.type AS tenant_type,
              (SELECT GROUP_CONCAT(property_name, '、') FROM lease_items WHERE lease_id = l.id) AS property_names,
              (SELECT COUNT(*) FROM bills WHERE lease_id = l.id) AS bill_count,
              (SELECT COALESCE(SUM(payable_amount - paid_amount),0) FROM bills
                WHERE lease_id = l.id AND payable_amount > paid_amount) AS owed_amount
         FROM leases l JOIN tenants t ON t.id = l.tenant_id
         ${whereSql}
         ORDER BY
           CASE l.status WHEN 'expiring' THEN 0 WHEN 'breach' THEN 1 WHEN 'active' THEN 2 WHEN 'expired' THEN 3 ELSE 4 END,
           l.end_date ASC
         LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    ok(res, {
      list: list.map((r) => ({
        ...r,
        status_label: svc.LEASE_STATUS_LABEL[String(r.status)] ?? String(r.status),
        pay_cycle_label: svc.PAY_CYCLE_LABEL[String(r.pay_cycle) as 'month'] ?? '',
      })),
      total: total.c,
      page,
      pageSize,
    })
  }),
)

/** 导出 */
leaseRouter.get(
  '/export',
  requirePermission('lease', 'export'),
  asyncHandler(async (req, res) => {
    const rows = getAll<Record<string, unknown>>(
      `SELECT l.*, t.name AS tenant_name, t.phone AS tenant_phone,
              (SELECT GROUP_CONCAT(property_name, '、') FROM lease_items WHERE lease_id = l.id) AS property_names
         FROM leases l JOIN tenants t ON t.id = l.tenant_id ORDER BY l.id DESC`,
    )

    logOperation(req, 'lease', 'export', '租约合同', `导出 ${rows.length} 条`)

    await exportExcel(
      res,
      stampedName('租约合同'),
      '租约合同',
      [
        { header: '租约号', key: 'lease_no', width: 16 },
        { header: '租客', key: 'tenant_name', width: 26 },
        { header: '联系电话', key: 'tenant_phone', width: 15 },
        { header: '业态', key: 'property_type', width: 10, value: (r) => (r.property_type === 'factory' ? '厂房' : '公寓') },
        { header: '关联房源', key: 'property_names', width: 40 },
        { header: '租期开始', key: 'start_date', width: 13 },
        { header: '租期结束', key: 'end_date', width: 13 },
        { header: '缴费周期', key: 'pay_cycle', width: 10, value: (r) => svc.PAY_CYCLE_LABEL[String(r.pay_cycle) as 'month'] ?? '' },
        { header: '月租金(元)', key: 'monthly_rent', width: 14 },
        { header: '月物业费(元)', key: 'monthly_property_fee', width: 14 },
        { header: '押金(元)', key: 'deposit_amount', width: 13 },
        { header: '装修总金额(元)', key: 'decoration_total', width: 16 },
        { header: '抵扣期数', key: 'decoration_periods', width: 11 },
        { header: '每期抵扣(元)', key: 'decoration_per_month', width: 14 },
        { header: '累计已抵扣(元)', key: 'decoration_deducted', width: 16 },
        { header: '状态', key: 'status', width: 12, value: (r) => svc.LEASE_STATUS_LABEL[String(r.status)] ?? '' },
      ],
      rows,
    )
  }),
)

/** 装修抵扣试算：新建租约表单实时调用，不落库 */
leaseRouter.post(
  '/preview',
  requirePermission('lease', 'view'),
  asyncHandler(async (req, res) => {
    const data = validateBody(previewSchema, req.body)

    const result = svc.previewPlan({
      startDate: data.start_date,
      endDate: data.end_date,
      payCycle: data.pay_cycle,
      picks: data.properties.map((id) => ({ property_type: data.property_type, property_id: id })),
      decorationTotal: data.decoration_total,
      decorationPeriods: data.decoration_periods,
      decorationPerMonth: data.decoration_per_month,
    })

    ok(res, result)
  }),
)

// ==================== 详情 ====================

leaseRouter.get(
  '/:id',
  requirePermission('lease', 'view'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '租约 ID')

    const lease = getOne<Record<string, unknown>>(
      `SELECT l.*, t.name AS tenant_name, t.phone AS tenant_phone, t.type AS tenant_type,
              t.id_card AS tenant_id_card, t.contact_name AS tenant_contact
         FROM leases l JOIN tenants t ON t.id = l.tenant_id WHERE l.id = ?`,
      [id],
    )
    if (!lease) throw AppError.notFound('租约不存在')

    const items = getAll(
      'SELECT * FROM lease_items WHERE lease_id = ? ORDER BY id',
      [id],
    )

    const bills = getAll<Record<string, unknown>>(
      `SELECT b.*, (SELECT COUNT(*) FROM payments WHERE bill_id = b.id) AS payment_count
         FROM bills b WHERE b.lease_id = ? ORDER BY b.period_index`,
      [id],
    )

    const payments = getAll(
      `SELECT p.*, b.bill_no FROM payments p JOIN bills b ON b.id = p.bill_id
        WHERE p.lease_id = ? ORDER BY p.pay_date DESC, p.id DESC`,
      [id],
    )

    const deposits = getAll(
      'SELECT * FROM deposit_records WHERE lease_id = ? ORDER BY happen_date, id',
      [id],
    )

    const decorationPlan = getAll(
      `SELECT period_index, period_start, period_end, due_date,
              rent_amount, property_fee, decoration_deduction, payable_amount
         FROM bills WHERE lease_id = ? AND decoration_deduction > 0 ORDER BY period_index`,
      [id],
    )

    const paidTotal = round2(
      (bills as Array<Record<string, unknown>>).reduce((s, b) => s + Number(b.paid_amount), 0),
    )
    const payableTotal = round2(
      (bills as Array<Record<string, unknown>>).reduce((s, b) => s + Number(b.payable_amount), 0),
    )

    ok(res, {
      lease: {
        ...lease,
        status_label: svc.LEASE_STATUS_LABEL[String(lease.status)] ?? '',
        pay_cycle_label: svc.PAY_CYCLE_LABEL[String(lease.pay_cycle) as 'month'] ?? '',
      },
      items,
      bills: (bills as Array<Record<string, unknown>>).map(decorateBill),
      payments,
      deposits,
      decoration_plan: decorationPlan,
      summary: {
        payable_total: payableTotal,
        paid_total: paidTotal,
        owed_total: round2(Math.max(payableTotal - paidTotal, 0)),
        bill_count: bills.length,
      },
    })
  }),
)

// ==================== 新建 ====================

leaseRouter.post(
  '/',
  requirePermission('lease', 'create'),
  asyncHandler(async (req, res) => {
    const data = emptyToNull(validateBody(createSchema, req.body))

    const tenant = getOne<{ id: number; name: string }>('SELECT id, name FROM tenants WHERE id = ?', [
      data.tenant_id,
    ])
    if (!tenant) throw AppError.notFound('租客不存在')

    const picks = data.properties.map((pid) => ({
      property_type: data.property_type,
      property_id: pid,
    }))

    svc.assertPropertiesAvailable(picks)
    const items = svc.resolvePropertyItems(picks)

    const monthlyRent = round2(items.reduce((s, i) => s + i.monthly_rent, 0))
    const monthlyPropertyFee = round2(items.reduce((s, i) => s + i.monthly_property_fee, 0))
    const decorationPerMonth =
      data.decoration_periods > 0
        ? data.decoration_per_month > 0
          ? round2(data.decoration_per_month)
          : round2(data.decoration_total / data.decoration_periods)
        : 0

    const leaseNo = svc.nextLeaseNo()
    const status = svc.deriveLeaseStatus(data.end_date)

    let leaseId = 0

    const run = db.transaction(() => {
      leaseId = Number(
        db
          .prepare(
            `INSERT INTO leases (
               lease_no, tenant_id, property_type, start_date, end_date, pay_cycle,
               monthly_rent, monthly_property_fee, deposit_amount,
               decoration_total, decoration_periods, decoration_per_month, decoration_deducted,
               extra_clause, status, sign_date, remark
             ) VALUES (
               @lease_no, @tenant_id, @property_type, @start_date, @end_date, @pay_cycle,
               @monthly_rent, @monthly_property_fee, @deposit_amount,
               @decoration_total, @decoration_periods, @decoration_per_month, 0,
               @extra_clause, @status, @sign_date, @remark
             )`,
          )
          .run({
            lease_no: leaseNo,
            tenant_id: data.tenant_id,
            property_type: data.property_type,
            start_date: data.start_date,
            end_date: data.end_date,
            pay_cycle: data.pay_cycle,
            monthly_rent: monthlyRent,
            monthly_property_fee: monthlyPropertyFee,
            deposit_amount: data.deposit_amount,
            decoration_total: data.decoration_total,
            decoration_periods: data.decoration_periods,
            decoration_per_month: decorationPerMonth,
            extra_clause: data.extra_clause ?? null,
            status,
            sign_date: data.sign_date ?? data.start_date,
            remark: data.remark ?? null,
          } as never).lastInsertRowid,
      )

      const insertItem = db.prepare(
        `INSERT INTO lease_items (lease_id, property_type, property_id, property_name, monthly_rent, monthly_property_fee)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      for (const item of items) {
        insertItem.run(
          leaseId,
          item.property_type,
          item.property_id,
          item.property_name,
          item.monthly_rent,
          item.monthly_property_fee,
        )
      }

      if (data.deposit_amount > 0) {
        db.prepare(
          `INSERT INTO deposit_records (lease_id, tenant_id, type, amount, happen_date, remark, operator)
           VALUES (?, ?, 'collect', ?, ?, '签约时收取押金', ?)`,
        ).run(leaseId, data.tenant_id, data.deposit_amount, data.sign_date ?? data.start_date, req.user!.realName)
      }
    })

    run()

    // 账单生成放在事务外：期数多时事务体量较大，且失败可单独重试
    const result = svc.generateBills({
      leaseId,
      leaseNo,
      tenantId: data.tenant_id,
      propertyType: data.property_type,
      startDate: data.start_date,
      endDate: data.end_date,
      payCycle: data.pay_cycle,
      monthlyRent,
      monthlyPropertyFee,
      decorationTotal: data.decoration_total,
      decorationPeriods: data.decoration_periods,
      decorationPerMonth,
    })

    svc.syncPropertyStatusOf(items)

    logOperation(
      req,
      'lease',
      'create',
      leaseNo,
      `为「${tenant.name}」新建租约，关联 ${items.length} 个房源，生成 ${result.count} 期账单，装修抵扣 ${result.totalDeduction} 元`,
    )

    ok(res, {
      id: leaseId,
      lease_no: leaseNo,
      bill_count: result.count,
      monthly_rent: monthlyRent,
      monthly_property_fee: monthlyPropertyFee,
    })
  }),
)

// ==================== 编辑 ====================

/**
 * 编辑租约：不允许改关联房源（需退租后重建），避免已生成账单与房源对不上。
 * 显式声明而非从 createSchema 派生，避免 zod 版本差异导致的类型 API 不兼容。
 */
const updateSchema = z
  .object({
    start_date: dateStr,
    end_date: dateStr,
    pay_cycle: z.enum(['month', 'quarter', 'year']),
    deposit_amount: z.coerce.number().nonnegative().default(0),
    decoration_total: z.coerce.number().nonnegative().default(0),
    decoration_periods: z.coerce.number().int().nonnegative().default(0),
    decoration_per_month: z.coerce.number().nonnegative().default(0),
    sign_date: dateStr.nullish(),
    extra_clause: z.string().nullish(),
    remark: z.string().nullish(),
  })
  .refine((v) => v.end_date > v.start_date, {
    message: '租期结束日期必须晚于开始日期',
    path: ['end_date'],
  })

leaseRouter.put(
  '/:id',
  requirePermission('lease', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '租约 ID')
    const lease = getOne<{ lease_no: string; property_type: string; monthly_rent: number; monthly_property_fee: number }>(
      'SELECT lease_no, property_type, monthly_rent, monthly_property_fee FROM leases WHERE id = ?',
      [id],
    )
    if (!lease) throw AppError.notFound('租约不存在')

    const data = emptyToNull(validateBody(updateSchema, req.body))

    const decorationPerMonth =
      data.decoration_periods > 0
        ? data.decoration_per_month > 0
          ? round2(data.decoration_per_month)
          : round2(data.decoration_total / data.decoration_periods)
        : 0

    const status = svc.deriveLeaseStatus(data.end_date)

    db.prepare(
      `UPDATE leases SET
         start_date = @start_date, end_date = @end_date, pay_cycle = @pay_cycle,
         deposit_amount = @deposit_amount,
         decoration_total = @decoration_total, decoration_periods = @decoration_periods,
         decoration_per_month = @decoration_per_month,
         extra_clause = @extra_clause, sign_date = @sign_date, remark = @remark,
         status = @status, updated_at = datetime('now','localtime')
       WHERE id = @id`,
    ).run({
      ...toSqlParams(data, LEASE_UPDATE_COLUMNS),
      decoration_per_month: decorationPerMonth,
      status,
      id,
    } as never)

    logOperation(req, 'lease', 'edit', lease.lease_no, '修改租约信息')
    ok(res, { success: true })
  }),
)

/**
 * 重新生成账单。
 * 租金或装修抵扣参数变更后，原有账单金额已失真，需要整体重算。
 * 注意：会清空该租约已有账单与收款流水，仅允许在无收款时执行。
 */
leaseRouter.post(
  '/:id/regenerate-bills',
  requirePermission('lease', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '租约 ID')

    const lease = getOne<{
      lease_no: string
      tenant_id: number
      property_type: string
      start_date: string
      end_date: string
      pay_cycle: string
      monthly_rent: number
      monthly_property_fee: number
      decoration_total: number
      decoration_periods: number
      decoration_per_month: number
    }>('SELECT * FROM leases WHERE id = ?', [id])
    if (!lease) throw AppError.notFound('租约不存在')

    const paidCount = db
      .prepare('SELECT COUNT(*) AS c FROM payments WHERE lease_id = ?')
      .get(id) as { c: number }
    if (paidCount.c > 0) {
      throw AppError.conflict('该租约已有收款流水，重新生成账单会导致对账错乱，请先作废收款记录')
    }

    const result = svc.generateBills({
      leaseId: id,
      leaseNo: lease.lease_no,
      tenantId: lease.tenant_id,
      propertyType: lease.property_type as 'factory',
      startDate: lease.start_date,
      endDate: lease.end_date,
      payCycle: lease.pay_cycle as 'month',
      monthlyRent: lease.monthly_rent,
      monthlyPropertyFee: lease.monthly_property_fee,
      decorationTotal: lease.decoration_total,
      decorationPeriods: lease.decoration_periods,
      decorationPerMonth: lease.decoration_per_month,
    })

    logOperation(req, 'lease', 'edit', lease.lease_no, `重新生成账单 ${result.count} 期`)
    ok(res, result)
  }),
)

// ==================== 退租结算 ====================

leaseRouter.post(
  '/:id/settlement',
  requirePermission('lease', 'view'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '租约 ID')
    const data = validateBody(settlementSchema, req.body)
    ok(res, svc.buildSettlement(id, data))
  }),
)

leaseRouter.post(
  '/:id/terminate',
  requirePermission('lease', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '租约 ID')
    const data = validateBody(settlementSchema, req.body)

    const result = svc.commitTermination(id, data, req.user!.realName)

    logOperation(
      req,
      'lease',
      'edit',
      result.lease_no,
      `办理退租：押金抵扣 ${result.total_deduction} 元，退还 ${result.refund_amount} 元`,
    )

    ok(res, result)
  }),
)

/** 标记解约欠费（租客跑路或恶意欠费场景） */
leaseRouter.post(
  '/:id/mark-breach',
  requirePermission('lease', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '租约 ID')
    const schema = z.object({ reason: z.string().min(1, '请填写解约原因') })
    const { reason } = validateBody(schema, req.body)

    const lease = getOne<{ lease_no: string }>('SELECT lease_no FROM leases WHERE id = ?', [id])
    if (!lease) throw AppError.notFound('租约不存在')

    db.prepare(
      `UPDATE leases SET status = 'breach', terminate_reason = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    ).run(reason, id)

    svc.syncPropertyStatusByLease(id)

    logOperation(req, 'lease', 'edit', lease.lease_no, `标记解约欠费：${reason}`)
    ok(res, { success: true })
  }),
)

// ==================== 合同预览 ====================

leaseRouter.get(
  '/:id/contract',
  requirePermission('lease', 'view'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '租约 ID')
    const kind = (String(req.query.kind ?? '') || '') as ContractKind | ''

    const lease = getOne<Record<string, unknown>>(
      `SELECT l.*, t.name AS tenant_name, t.phone AS tenant_phone, t.type AS tenant_type,
              t.id_card AS tenant_id_card, t.contact_name AS tenant_contact
         FROM leases l JOIN tenants t ON t.id = l.tenant_id WHERE l.id = ?`,
      [id],
    )
    if (!lease) throw AppError.notFound('租约不存在')

    const items = getAll<{ property_name: string }>(
      'SELECT property_name FROM lease_items WHERE lease_id = ?',
      [id],
    )

    const plan = getAll<{
      period_index: number
      period_start: string
      period_end: string
      due_date: string
      rent_amount: number
      property_fee: number
      decoration_deduction: number
      payable_amount: number
    }>('SELECT * FROM bills WHERE lease_id = ? ORDER BY period_index', [id])

    const resolvedKind: ContractKind =
      kind === 'decoration'
        ? 'decoration'
        : (lease.property_type as 'factory' | 'apartment')

    const ctx: ContractContext = {
      lease_no: String(lease.lease_no),
      tenant_name: String(lease.tenant_name),
      tenant_contact: String(lease.tenant_contact ?? ''),
      tenant_phone: String(lease.tenant_phone ?? ''),
      tenant_id_card: String(lease.tenant_id_card ?? ''),
      tenant_type: String(lease.tenant_type),
      property_names: items.map((i) => i.property_name),
      property_type: lease.property_type as 'factory',
      start_date: String(lease.start_date),
      end_date: String(lease.end_date),
      sign_date: String(lease.sign_date ?? lease.start_date),
      pay_cycle_label: svc.PAY_CYCLE_LABEL[String(lease.pay_cycle) as 'month'] ?? '月付',
      monthly_rent: Number(lease.monthly_rent),
      monthly_property_fee: Number(lease.monthly_property_fee),
      deposit_amount: Number(lease.deposit_amount),
      decoration_total: Number(lease.decoration_total),
      decoration_periods: Number(lease.decoration_periods),
      decoration_per_month: Number(lease.decoration_per_month),
      extra_clause: String(lease.extra_clause ?? ''),
      plan: plan.map((p) => ({
        periodIndex: p.period_index,
        periodStart: p.period_start,
        periodEnd: p.period_end,
        dueDate: p.due_date,
        rentAmount: p.rent_amount,
        propertyFee: p.property_fee,
        decorationDeduction: p.decoration_deduction,
        payableAmount: p.payable_amount,
      })),
    }

    ok(res, {
      kind: resolvedKind,
      html: renderContract(resolvedKind, ctx),
      available_kinds: lease.property_type === 'factory'
        ? ['factory', 'decoration']
        : ['apartment', 'decoration'],
      has_decoration: Number(lease.decoration_total) > 0,
    })
  }),
)
