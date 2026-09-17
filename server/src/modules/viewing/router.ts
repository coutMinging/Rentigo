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
import { emptyToNull, parseId, validateBody } from '../../utils/validate'

type ViewingStatus = 'pending' | 'appointed' | 'viewed' | 'no_intent' | 'signed'

/** 状态中文标签：列表导出与操作日志共用，保证全站文案一致 */
const STATUS_LABEL: Record<ViewingStatus, string> = {
  pending: '待确认',
  appointed: '已预约',
  viewed: '已看房',
  no_intent: '无意向',
  signed: '已签约',
}

/**
 * 允许的状态流转白名单。
 * 「无意向」可被重新激活为已预约；「已签约」为终态，不允许回退，
 * 避免已生成租约的记录被改回看房阶段造成对账混乱。
 */
const TRANSITIONS: Record<ViewingStatus, ViewingStatus[]> = {
  pending: ['appointed', 'no_intent'],
  appointed: ['viewed', 'no_intent'],
  viewed: ['signed', 'no_intent'],
  no_intent: ['appointed'],
  signed: [],
}

export const viewingRouter = Router()
viewingRouter.use(authRequired)

const viewingSchema = z.object({
  tenant_id: z.coerce.number().int().positive().nullish(),
  tenant_name: z.string().trim().min(1, '请输入租客姓名或公司名称'),
  phone: z.string().trim().min(6, '请输入有效联系电话'),
  property_type: z.enum(['factory', 'apartment']),
  property_id: z.coerce.number().int().positive().nullish(),
  appoint_time: z.string().trim().nullish(),
  status: z.enum(['pending', 'appointed', 'viewed', 'no_intent', 'signed']).default('pending'),
  remark: z.string().nullish(),
})

const statusSchema = z.object({
  status: z.enum(['pending', 'appointed', 'viewed', 'no_intent', 'signed']),
  lease_id: z.coerce.number().int().positive().nullish(),
})

const followUpSchema = z.object({
  content: z.string().trim().min(1, '请输入跟进内容'),
  follow_up_at: z.string().trim().nullish(),
})

interface ViewingFilters {
  keyword: string
  status: string
  propertyType: string
  startDate: string
  endDate: string
}

function parseFilters(query: Record<string, unknown>): ViewingFilters {
  return {
    keyword: String(query.keyword ?? '').trim(),
    status: String(query.status ?? '').trim(),
    propertyType: String(query.property_type ?? '').trim(),
    startDate: String(query.start_date ?? '').trim(),
    endDate: String(query.end_date ?? '').trim(),
  }
}

/**
 * 构造 WHERE 子句。
 * withStatus=false 时忽略状态条件，用于页头「各状态数量」统计——
 * 否则选中某个状态后，其他状态的数字会全部归零，失去参考意义。
 */
function buildWhere(filters: ViewingFilters, withStatus: boolean): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  if (filters.keyword) {
    const like = `%${filters.keyword}%`
    clauses.push('(tenant_name LIKE ? OR phone LIKE ? OR property_name LIKE ?)')
    params.push(like, like, like)
  }
  if (withStatus && filters.status) {
    clauses.push('status = ?')
    params.push(filters.status)
  }
  if (filters.propertyType) {
    clauses.push('property_type = ?')
    params.push(filters.propertyType)
  }
  if (filters.startDate) {
    clauses.push('appoint_time >= ?')
    params.push(`${filters.startDate} 00:00:00`)
  }
  if (filters.endDate) {
    clauses.push('appoint_time <= ?')
    params.push(`${filters.endDate} 23:59:59`)
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

/** 反查房源名称，不信任前端传值 */
function resolvePropertyName(
  propertyType: 'factory' | 'apartment',
  propertyId: number | null | undefined,
): string | null {
  if (!propertyId) return null

  if (propertyType === 'factory') {
    const row = getOne<{ name: string }>('SELECT name FROM factories WHERE id = ?', [propertyId])
    if (!row) throw AppError.badRequest(`厂房房源 ${propertyId} 不存在`)
    return row.name
  }

  const row = getOne<{ code: string }>('SELECT code FROM apartments WHERE id = ?', [propertyId])
  if (!row) throw AppError.badRequest(`公寓房间 ${propertyId} 不存在`)
  return `${row.code} 房间`
}

/** 关联已有租客时以档案里的姓名与电话为准，避免前后端不一致 */
function resolveTenant(
  tenantId: number | null | undefined,
  fallbackName: string,
  fallbackPhone: string,
): { tenantId: number | null; name: string; phone: string } {
  if (!tenantId) return { tenantId: null, name: fallbackName, phone: fallbackPhone }

  const tenant = getOne<{ id: number; name: string; phone: string }>(
    'SELECT id, name, phone FROM tenants WHERE id = ?',
    [tenantId],
  )
  if (!tenant) throw AppError.badRequest('所选租客不存在')

  return { tenantId: tenant.id, name: tenant.name, phone: tenant.phone }
}

/** 校验状态流转是否合法 */
function assertTransition(from: ViewingStatus, to: ViewingStatus): void {
  if (from === to) return
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw AppError.badRequest(`不允许从「${STATUS_LABEL[from]}」变更为「${STATUS_LABEL[to]}」`)
  }
}

// ==================== 列表（含筛选与状态统计） ====================

viewingRouter.get('/', requirePermission('viewing', 'view'), (req, res) => {
  const query = req.query as Record<string, unknown>
  const { page, pageSize, offset } = parsePageQuery(query, config.defaultPageSize, config.maxPageSize)
  const filters = parseFilters(query)
  const { sql: whereSql, params } = buildWhere(filters, true)

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM viewings ${whereSql}`)
    .get(...(params as never[])) as { c: number }

  const list = getAll(
    `SELECT v.*,
            (SELECT COUNT(*) FROM viewing_follow_ups f WHERE f.viewing_id = v.id) AS follow_up_count
       FROM viewings v ${whereSql}
      ORDER BY v.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  const statWhere = buildWhere(filters, false)
  const statRows = getAll<{ status: string; c: number }>(
    `SELECT status, COUNT(*) AS c FROM viewings ${statWhere.sql} GROUP BY status`,
    statWhere.params,
  )
  const stats: Record<string, number> = {
    pending: 0,
    appointed: 0,
    viewed: 0,
    no_intent: 0,
    signed: 0,
    total: 0,
  }
  for (const row of statRows) {
    if (row.status in stats) stats[row.status] = row.c
    stats.total += row.c
  }

  ok(res, { list, total: total.c, page, pageSize, stats })
})

// ==================== 导出（须在 /:id 之前注册） ====================

viewingRouter.get(
  '/export',
  requirePermission('viewing', 'export'),
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query as Record<string, unknown>)
    const { sql: whereSql, params } = buildWhere(filters, true)

    const rows = getAll<Record<string, unknown>>(
      `SELECT v.*,
              (SELECT COUNT(*) FROM viewing_follow_ups f WHERE f.viewing_id = v.id) AS follow_up_count
         FROM viewings v ${whereSql} ORDER BY v.id DESC`,
      params,
    )

    logOperation(req, 'viewing', 'export', '看房预约台账', `导出 ${rows.length} 条`)

    await exportExcel(
      res,
      stampedName('看房预约台账'),
      '看房预约',
      [
        { header: '租客姓名/公司', key: 'tenant_name', width: 26 },
        { header: '联系电话', key: 'phone', width: 16 },
        {
          header: '业态',
          key: 'property_type',
          width: 10,
          value: (r) => (r.property_type === 'factory' ? '厂房' : '公寓'),
        },
        { header: '意向房源', key: 'property_name', width: 30 },
        { header: '预约时间', key: 'appoint_time', width: 20 },
        {
          header: '状态',
          key: 'status',
          width: 12,
          value: (r) => STATUS_LABEL[r.status as ViewingStatus] ?? String(r.status ?? ''),
        },
        { header: '跟进次数', key: 'follow_up_count', width: 10 },
        { header: '备注', key: 'remark', width: 30 },
        { header: '登记时间', key: 'created_at', width: 20 },
      ],
      rows,
    )
  }),
)

// ==================== 详情 ====================

viewingRouter.get('/:id', requirePermission('viewing', 'view'), (req, res) => {
  const id = parseId(req.params.id, '看房预约 ID')
  const row = getOne<Record<string, unknown>>('SELECT * FROM viewings WHERE id = ?', [id])
  if (!row) throw AppError.notFound('看房预约不存在')

  const followUps = getAll(
    'SELECT * FROM viewing_follow_ups WHERE viewing_id = ? ORDER BY follow_up_at DESC, id DESC',
    [id],
  )

  const leaseNo = row.lease_id
    ? (getOne<{ lease_no: string }>('SELECT lease_no FROM leases WHERE id = ?', [row.lease_id])?.lease_no ?? null)
    : null

  ok(res, { ...row, follow_ups: followUps, lease_no: leaseNo })
})

// ==================== 新增 ====================

viewingRouter.post(
  '/',
  requirePermission('viewing', 'create'),
  asyncHandler(async (req, res) => {
    const data = validateBody(viewingSchema, emptyToNull(req.body as Record<string, unknown>))
    const tenant = resolveTenant(data.tenant_id, data.tenant_name, data.phone)
    const propertyName = resolvePropertyName(data.property_type, data.property_id)

    const info = db
      .prepare(
        `INSERT INTO viewings (
           tenant_id, tenant_name, phone, property_type, property_id, property_name,
           appoint_time, status, remark, created_at, updated_at
         ) VALUES (
           @tenant_id, @tenant_name, @phone, @property_type, @property_id, @property_name,
           @appoint_time, @status, @remark, datetime('now','localtime'), datetime('now','localtime')
         )`,
      )
      .run({
        tenant_id: tenant.tenantId,
        tenant_name: tenant.name,
        phone: tenant.phone,
        property_type: data.property_type,
        property_id: data.property_id ?? null,
        property_name: propertyName,
        appoint_time: data.appoint_time ?? null,
        status: data.status,
        remark: data.remark ?? null,
      } as never)

    logOperation(req, 'viewing', 'create', tenant.name, `登记看房预约（${STATUS_LABEL[data.status]}）`)
    ok(res, { id: Number(info.lastInsertRowid) })
  }),
)

// ==================== 编辑 ====================

viewingRouter.put(
  '/:id',
  requirePermission('viewing', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '看房预约 ID')
    const current = getOne<{ status: ViewingStatus }>('SELECT status FROM viewings WHERE id = ?', [id])
    if (!current) throw AppError.notFound('看房预约不存在')

    const data = validateBody(viewingSchema, emptyToNull(req.body as Record<string, unknown>))
    assertTransition(current.status, data.status)

    const tenant = resolveTenant(data.tenant_id, data.tenant_name, data.phone)
    const propertyName = resolvePropertyName(data.property_type, data.property_id)

    db.prepare(
      `UPDATE viewings SET
         tenant_id = @tenant_id, tenant_name = @tenant_name, phone = @phone,
         property_type = @property_type, property_id = @property_id, property_name = @property_name,
         appoint_time = @appoint_time, status = @status, remark = @remark,
         updated_at = datetime('now','localtime')
       WHERE id = @id`,
    ).run({
      tenant_id: tenant.tenantId,
      tenant_name: tenant.name,
      phone: tenant.phone,
      property_type: data.property_type,
      property_id: data.property_id ?? null,
      property_name: propertyName,
      appoint_time: data.appoint_time ?? null,
      status: data.status,
      remark: data.remark ?? null,
      id,
    } as never)

    logOperation(req, 'viewing', 'edit', tenant.name, `修改看房预约（${STATUS_LABEL[data.status]}）`)
    ok(res, { success: true })
  }),
)

// ==================== 状态流转 ====================

viewingRouter.put(
  '/:id/status',
  requirePermission('viewing', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '看房预约 ID')
    const data = validateBody(statusSchema, emptyToNull(req.body as Record<string, unknown>))

    const current = getOne<{ status: ViewingStatus; tenant_name: string }>(
      'SELECT status, tenant_name FROM viewings WHERE id = ?',
      [id],
    )
    if (!current) throw AppError.notFound('看房预约不存在')

    assertTransition(current.status, data.status)

    // 仅「已签约」保留关联租约，其余状态清空，避免脏关联
    const leaseId = data.status === 'signed' ? (data.lease_id ?? null) : null

    db.prepare(
      `UPDATE viewings SET status = ?, lease_id = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    ).run(data.status, leaseId, id)

    logOperation(req, 'viewing', 'edit', current.tenant_name, `看房状态变更为「${STATUS_LABEL[data.status]}」`)
    ok(res, { success: true })
  }),
)

// ==================== 跟进记录 ====================

viewingRouter.post(
  '/:id/follow-ups',
  requirePermission('viewing', 'create'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '看房预约 ID')
    const data = validateBody(followUpSchema, emptyToNull(req.body as Record<string, unknown>))

    const viewing = getOne<{ tenant_name: string }>('SELECT tenant_name FROM viewings WHERE id = ?', [id])
    if (!viewing) throw AppError.notFound('看房预约不存在')

    const info = db
      .prepare(
        `INSERT INTO viewing_follow_ups (viewing_id, content, follow_up_at, operator, created_at)
         VALUES (?, ?, COALESCE(?, datetime('now','localtime')), ?, datetime('now','localtime'))`,
      )
      .run(id, data.content, data.follow_up_at ?? null, req.user?.realName ?? null)

    logOperation(req, 'viewing', 'edit', viewing.tenant_name, '追加看房跟进记录')
    ok(res, { id: Number(info.lastInsertRowid) })
  }),
)

// ==================== 删除（跟进记录随外键级联清理） ====================

viewingRouter.delete(
  '/:id',
  requirePermission('viewing', 'delete'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '看房预约 ID')
    const row = getOne<{ tenant_name: string }>('SELECT tenant_name FROM viewings WHERE id = ?', [id])
    if (!row) throw AppError.notFound('看房预约不存在')

    db.prepare('DELETE FROM viewings WHERE id = ?').run(id)
    logOperation(req, 'viewing', 'delete', row.tenant_name, '删除看房预约及其跟进记录')
    ok(res, { success: true })
  }),
)
