import { Router } from 'express'
import { z } from 'zod'
import { config } from '../../config'
import { db, getAll, getOne } from '../../db'
import { authRequired } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/error'
import { requirePermission } from '../../middleware/permission'
import { exportExcel, stampedName } from '../../utils/excel'
import { logOperation } from '../../utils/operationLog'
import { AppError, ok, parsePageQuery } from '../../utils/response'
import { emptyToNull, parseId, toSqlParams, validateBody } from '../../utils/validate'

const TENANT_COLUMNS = [
  'type',
  'name',
  'contact_name',
  'phone',
  'id_card',
  'id_card_file',
  'license_file',
  'tags',
  'address',
  'remark',
] as const

export const tenantRouter = Router()
tenantRouter.use(authRequired)

const TAG_META: Record<string, string> = {
  intent: '意向租客',
  signed: '已签约租客',
  arrears: '欠费租客',
  renew: '待续租租客',
}

function parseTags(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/**
 * 标签 = 手动标记 + 业务推导。
 * 「已签约 / 待续租 / 欠费」这三类不该靠人工维护，
 * 否则租约一变标签就失真，所以每次查询实时算出来。
 */
function computeTags(tenantId: number, manualTags: string[]): string[] {
  const tags = new Set(manualTags)

  const leaseStat = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status IN ('active','expiring') THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN status = 'expiring' THEN 1 ELSE 0 END) AS expiring_count
       FROM leases WHERE tenant_id = ?`,
    )
    .get(tenantId) as { active_count: number | null; expiring_count: number | null }

  if ((leaseStat.active_count ?? 0) > 0) tags.add('signed')
  if ((leaseStat.expiring_count ?? 0) > 0) tags.add('renew')

  const arrears = db
    .prepare(
      `SELECT COUNT(*) AS c FROM bills
        WHERE tenant_id = ? AND status IN ('overdue','partial')
          AND payable_amount > paid_amount`,
    )
    .get(tenantId) as { c: number }

  if (arrears.c > 0) tags.add('arrears')

  return Array.from(tags).filter((t) => TAG_META[t] !== undefined || t === 'intent')
}

const tenantSchema = z
  .object({
    type: z.enum(['person', 'company']).default('person'),
    name: z.string().min(1, '请输入租客姓名或公司名称'),
    contact_name: z.string().nullish(),
    phone: z.string().min(6, '请输入有效联系电话'),
    id_card: z.string().nullish(),
    id_card_file: z.string().nullish(),
    license_file: z.string().nullish(),
    tags: z.array(z.string()).default([]),
    address: z.string().nullish(),
    remark: z.string().nullish(),
  })
  .refine((v) => v.type !== 'company' || !!(v.contact_name && v.contact_name.trim()), {
    message: '企业租客需填写联系人',
    path: ['contact_name'],
  })

/** 列表：支持关键词、类型、标签筛选 */
tenantRouter.get(
  '/',
  requirePermission('tenant', 'view'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePageQuery(
      req.query as Record<string, unknown>,
      config.defaultPageSize,
      config.maxPageSize,
    )

    const where: string[] = []
    const params: unknown[] = []

    const keyword = String(req.query.keyword ?? '').trim()
    if (keyword) {
      where.push('(name LIKE ? OR phone LIKE ? OR contact_name LIKE ? OR id_card LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    }

    const type = String(req.query.type ?? '').trim()
    if (type) {
      where.push('type = ?')
      params.push(type)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    // 标签含业务推导，无法在 SQL 里过滤，因此先取全量再在内存里筛选
    const all = getAll<Record<string, unknown>>(
      `SELECT * FROM tenants ${whereSql} ORDER BY id DESC`,
      params,
    )

    const tagFilter = String(req.query.tag ?? '').trim()
    const enriched = all.map((row) => {
      const id = Number(row.id)
      const manual = parseTags(row.tags)
      let activeLeaseCount = 0
      let totalRent = 0

      const stat = db
        .prepare(
          `SELECT COUNT(*) AS c, COALESCE(SUM(monthly_rent),0) AS rent
             FROM leases WHERE tenant_id = ? AND status IN ('active','expiring')`,
        )
        .get(id) as { c: number; rent: number }

      activeLeaseCount = stat.c
      totalRent = stat.rent

      const owed = db
        .prepare(
          `SELECT COALESCE(SUM(payable_amount - paid_amount),0) AS owed
             FROM bills WHERE tenant_id = ? AND status IN ('overdue','partial')`,
        )
        .get(id) as { owed: number }

      return {
        ...row,
        tags: computeTags(id, manual),
        manual_tags: manual,
        active_lease_count: activeLeaseCount,
        monthly_rent: Math.round(totalRent * 100) / 100,
        owed_amount: Math.round(owed.owed * 100) / 100,
      }
    })

    const filtered = tagFilter ? enriched.filter((r) => (r.tags as string[]).includes(tagFilter)) : enriched
    const paged = filtered.slice(offset, offset + pageSize)

    ok(res, { list: paged, total: filtered.length, page, pageSize })
  }),
)

/** 下拉选项 */
tenantRouter.get('/options', requirePermission('tenant', 'view'), (_req, res) => {
  const rows = getAll('SELECT id, type, name, contact_name, phone FROM tenants ORDER BY id DESC')
  ok(res, rows)
})

/** 导出 */
tenantRouter.get(
  '/export',
  requirePermission('tenant', 'export'),
  asyncHandler(async (req, res) => {
    const rows = getAll<Record<string, unknown>>('SELECT * FROM tenants ORDER BY id DESC')

    logOperation(req, 'tenant', 'export', '租客档案', `导出 ${rows.length} 条`)

    await exportExcel(
      res,
      stampedName('租客档案'),
      '租客档案',
      [
        { header: '租客类型', key: 'type', width: 12, value: (r) => (r.type === 'company' ? '企业租客' : '个人租客') },
        { header: '姓名/公司名称', key: 'name', width: 30 },
        { header: '联系人', key: 'contact_name', width: 12 },
        { header: '联系电话', key: 'phone', width: 16 },
        { header: '证件号/统一社会信用代码', key: 'id_card', width: 26 },
        { header: '租客标签', key: 'tags', width: 30, value: (r) => parseTags(r.tags).map((t) => TAG_META[t] ?? t).join('、') },
        { header: '联系地址', key: 'address', width: 34 },
        { header: '备注', key: 'remark', width: 24 },
        { header: '创建时间', key: 'created_at', width: 20 },
      ],
      rows,
    )
  }),
)

/** 详情：自动关联名下房源、有效租约与历史租赁记录 */
tenantRouter.get(
  '/:id',
  requirePermission('tenant', 'view'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '租客 ID')
    const row = getOne<Record<string, unknown>>('SELECT * FROM tenants WHERE id = ?', [id])
    if (!row) throw AppError.notFound('租客不存在')

    const leases = getAll<Record<string, unknown>>(
      `SELECT id, lease_no, property_type, start_date, end_date, pay_cycle,
              monthly_rent, deposit_amount, decoration_total, decoration_deducted, status
         FROM leases WHERE tenant_id = ? ORDER BY start_date DESC`,
      [id],
    )

    const properties = getAll(
      `SELECT li.property_type, li.property_id, li.property_name, li.monthly_rent, l.lease_no, l.status AS lease_status
         FROM lease_items li JOIN leases l ON l.id = li.lease_id
        WHERE l.tenant_id = ? ORDER BY l.start_date DESC`,
      [id],
    )

    const bills = getAll(
      `SELECT id, bill_no, period_start, period_end, due_date, payable_amount, paid_amount, status, property_type
         FROM bills WHERE tenant_id = ? ORDER BY due_date DESC LIMIT 30`,
      [id],
    )

    const owed = db
      .prepare(
        `SELECT COALESCE(SUM(payable_amount - paid_amount),0) AS owed, COUNT(*) AS c
           FROM bills WHERE tenant_id = ? AND payable_amount > paid_amount`,
      )
      .get(id) as { owed: number; c: number }

    const manual = parseTags(row.tags)

    ok(res, {
      ...row,
      tags: computeTags(id, manual),
      manual_tags: manual,
      active_leases: leases.filter((l) => l.status === 'active' || l.status === 'expiring'),
      history_leases: leases.filter((l) => l.status !== 'active' && l.status !== 'expiring'),
      properties,
      recent_bills: bills,
      owed_amount: Math.round(owed.owed * 100) / 100,
      unpaid_bill_count: owed.c,
    })
  }),
)

/** 新增 */
tenantRouter.post(
  '/',
  requirePermission('tenant', 'create'),
  asyncHandler(async (req, res) => {
    const data = emptyToNull(validateBody(tenantSchema, req.body))

    const info = db
      .prepare(
        `INSERT INTO tenants (type, name, contact_name, phone, id_card, id_card_file, license_file, tags, address, remark)
         VALUES (@type, @name, @contact_name, @phone, @id_card, @id_card_file, @license_file, @tags, @address, @remark)`,
      )
      .run({ ...toSqlParams(data, TENANT_COLUMNS), tags: JSON.stringify(data.tags ?? []) } as never)

    logOperation(req, 'tenant', 'create', data.name, `新增租客「${data.name}」`)
    ok(res, { id: Number(info.lastInsertRowid) })
  }),
)

/** 编辑 */
tenantRouter.put(
  '/:id',
  requirePermission('tenant', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '租客 ID')
    if (!getOne('SELECT id FROM tenants WHERE id = ?', [id])) throw AppError.notFound('租客不存在')

    const data = emptyToNull(validateBody(tenantSchema, req.body))

    db.prepare(
      `UPDATE tenants SET
         type = @type, name = @name, contact_name = @contact_name, phone = @phone,
         id_card = @id_card, id_card_file = @id_card_file, license_file = @license_file,
         tags = @tags, address = @address, remark = @remark,
         updated_at = datetime('now','localtime')
       WHERE id = @id`,
    ).run({ ...toSqlParams(data, TENANT_COLUMNS), tags: JSON.stringify(data.tags ?? []), id } as never)

    logOperation(req, 'tenant', 'edit', data.name, `修改租客「${data.name}」`)
    ok(res, { success: true })
  }),
)

/** 删除：存在租约时禁止删除 */
tenantRouter.delete(
  '/:id',
  requirePermission('tenant', 'delete'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '租客 ID')
    const row = getOne<{ name: string }>('SELECT name FROM tenants WHERE id = ?', [id])
    if (!row) throw AppError.notFound('租客不存在')

    const leaseCount = db
      .prepare('SELECT COUNT(*) AS c FROM leases WHERE tenant_id = ?')
      .get(id) as { c: number }

    if (leaseCount.c > 0) {
      throw AppError.conflict(`该租客名下还有 ${leaseCount.c} 份租约记录，为保证台账可追溯，禁止删除`)
    }

    db.prepare('DELETE FROM tenants WHERE id = ?').run(id)
    logOperation(req, 'tenant', 'delete', row.name, `删除租客「${row.name}」`)
    ok(res, { success: true })
  }),
)
