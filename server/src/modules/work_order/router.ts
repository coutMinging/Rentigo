import { Router } from 'express'
import { z } from 'zod'
import { config } from '../../config'
import { db, getAll, getOne, parseJsonArray } from '../../db'
import { authRequired } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/error'
import { requirePermission } from '../../middleware/permission'
import { exportExcel, stampedName } from '../../utils/excel'
import { makeWorkOrderNo } from '../../utils/id'
import { logOperation } from '../../utils/operationLog'
import { AppError, ok, parsePageQuery } from '../../utils/response'
import { emptyToNull, parseId, validateBody } from '../../utils/validate'

type WorkOrderStatus = 'pending' | 'repairing' | 'done' | 'closed'
type PropertyType = 'factory' | 'apartment'

/** 状态中文标签：列表、导出与操作日志共用，保证全站文案一致 */
const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  pending: '待派单',
  repairing: '维修中',
  done: '已完工',
  closed: '已关闭',
}

const PROPERTY_LABEL: Record<PropertyType, string> = { factory: '厂房', apartment: '公寓' }

/**
 * 允许的状态流转白名单：待派单 → 维修中 → 已完工 → 已关闭。
 * 「已关闭」为终态不可回退；待派单可直接作废关闭。
 * from === to 时放行，从而同一接口既能流转、也能「仅更新维修进度」。
 */
const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  pending: ['repairing', 'closed'],
  repairing: ['done'],
  done: ['closed'],
  closed: [],
}

export const workOrderRouter = Router()
workOrderRouter.use(authRequired)

// ==================== 入参校验 ====================

/** 基础信息：新建与编辑共用，状态/维修人/费用等走独立的流转接口 */
const workOrderSchema = z.object({
  property_type: z.enum(['factory', 'apartment']),
  property_id: z.coerce.number().int().positive().nullish(),
  reporter: z.string().trim().min(1, '请输入报修人'),
  phone: z.string().trim().nullish(),
  fault_desc: z.string().trim().min(1, '请描述故障情况'),
  images: z.array(z.string().trim().min(1)).nullish(),
})

const statusSchema = z.object({
  status: z.enum(['pending', 'repairing', 'done', 'closed']),
  assignee: z.string().trim().nullish(),
  progress: z.string().trim().nullish(),
  cost: z.coerce.number().min(0, '维修费用不能为负数').nullish(),
  finish_remark: z.string().trim().nullish(),
})

// ==================== 筛选与 SQL 组装 ====================

interface WorkOrderFilters {
  keyword: string
  status: string
  propertyType: string
  assignee: string
  startDate: string
  endDate: string
}

function parseFilters(query: Record<string, unknown>): WorkOrderFilters {
  return {
    keyword: String(query.keyword ?? '').trim(),
    status: String(query.status ?? '').trim(),
    propertyType: String(query.property_type ?? '').trim(),
    assignee: String(query.assignee ?? '').trim(),
    startDate: String(query.start_date ?? '').trim(),
    endDate: String(query.end_date ?? '').trim(),
  }
}

/**
 * 构造 WHERE 子句。
 * withStatus=false 时忽略状态条件，用于页头各状态数量统计——
 * 否则选中某个状态后，其他状态的数量会全部归零。
 */
function buildWhere(filters: WorkOrderFilters, withStatus: boolean): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  if (filters.keyword) {
    const like = `%${filters.keyword}%`
    clauses.push(
      '(order_no LIKE ? OR reporter LIKE ? OR phone LIKE ? OR property_name LIKE ? OR fault_desc LIKE ?)',
    )
    params.push(like, like, like, like, like)
  }
  if (withStatus && filters.status) {
    clauses.push('status = ?')
    params.push(filters.status)
  }
  if (filters.propertyType) {
    clauses.push('property_type = ?')
    params.push(filters.propertyType)
  }
  if (filters.assignee) {
    clauses.push('assignee LIKE ?')
    params.push(`%${filters.assignee}%`)
  }
  if (filters.startDate) {
    clauses.push('created_at >= ?')
    params.push(`${filters.startDate} 00:00:00`)
  }
  if (filters.endDate) {
    clauses.push('created_at <= ?')
    params.push(`${filters.endDate} 23:59:59`)
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

// ==================== 公共辅助 ====================

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 本地当天日期，用于「本月新增」统计 */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** images 存的是 JSON 字符串，读接口统一解析成数组后再返回 */
function mapRow(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, images: parseJsonArray(row.images) }
}

/** 反查房源名称，不信任前端传值 */
function resolvePropertyName(
  propertyType: PropertyType,
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

/** 校验状态流转是否合法 */
function assertTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
  if (from === to) return
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw AppError.badRequest(`不允许从「${STATUS_LABEL[from]}」变更为「${STATUS_LABEL[to]}」`)
  }
}

/** 生成当月工单号：BX{yyyymm}{3 位序号}，order_no 唯一索引兜底 */
function nextOrderNo(): string {
  const now = new Date()
  const prefix = `BX${now.getFullYear()}${pad(now.getMonth() + 1)}`
  const row = getOne<{ max_no: string | null }>(
    'SELECT MAX(order_no) AS max_no FROM work_orders WHERE order_no LIKE ?',
    [`${prefix}%`],
  )
  const seq = row?.max_no ? Number(row.max_no.slice(prefix.length)) + 1 : 1
  return makeWorkOrderNo(seq, now)
}

// ==================== 列表（含状态与费用统计） ====================

workOrderRouter.get('/', requirePermission('workOrder', 'view'), (req, res) => {
  const query = req.query as Record<string, unknown>
  const { page, pageSize, offset } = parsePageQuery(query, config.defaultPageSize, config.maxPageSize)
  const filters = parseFilters(query)
  const { sql: whereSql, params } = buildWhere(filters, true)

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM work_orders ${whereSql}`)
    .get(...(params as never[])) as { c: number }

  const rows = getAll<Record<string, unknown>>(
    `SELECT * FROM work_orders ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  // 统计忽略状态筛选，保证切换状态时其余数量仍有参考意义
  const statWhere = buildWhere(filters, false)
  const statusRows = getAll<{ status: string; c: number }>(
    `SELECT status, COUNT(*) AS c FROM work_orders ${statWhere.sql} GROUP BY status`,
    statWhere.params,
  )

  const stats: Record<string, number> = {
    pending: 0,
    repairing: 0,
    done: 0,
    closed: 0,
    total: 0,
    total_cost: 0,
    month_new: 0,
  }
  for (const row of statusRows) {
    if (row.status in stats) stats[row.status] = row.c
    stats.total += row.c
  }

  const costRow = getOne<{ s: number | null }>(
    `SELECT COALESCE(SUM(cost), 0) AS s FROM work_orders ${statWhere.sql}`,
    statWhere.params,
  )
  stats.total_cost = Math.round((costRow?.s ?? 0) * 100) / 100

  const monthSql = statWhere.sql ? `${statWhere.sql} AND created_at >= ?` : 'WHERE created_at >= ?'
  const monthRow = getOne<{ c: number }>(`SELECT COUNT(*) AS c FROM work_orders ${monthSql}`, [
    ...statWhere.params,
    `${todayStr().slice(0, 7)}-01 00:00:00`,
  ])
  stats.month_new = monthRow?.c ?? 0

  ok(res, { list: rows.map(mapRow), total: total.c, page, pageSize, stats })
})

// ==================== 按房源维修统计（须在 /:id 之前注册） ====================

workOrderRouter.get('/stats', requirePermission('workOrder', 'view'), (req, res) => {
  const query = req.query as Record<string, unknown>
  const propertyType = String(query.property_type ?? '').trim()

  const clauses: string[] = []
  const params: unknown[] = []
  if (propertyType) {
    clauses.push('property_type = ?')
    params.push(propertyType)
  }
  const startDate = String(query.start_date ?? '').trim()
  if (startDate) {
    clauses.push('created_at >= ?')
    params.push(`${startDate} 00:00:00`)
  }
  const endDate = String(query.end_date ?? '').trim()
  if (endDate) {
    clauses.push('created_at <= ?')
    params.push(`${endDate} 23:59:59`)
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

  const list = getAll<Record<string, unknown>>(
    `SELECT property_type,
            property_id,
            property_name,
            COUNT(*) AS order_count,
            SUM(CASE WHEN status IN ('pending','repairing') THEN 1 ELSE 0 END) AS open_count,
            COALESCE(SUM(cost), 0) AS total_cost
       FROM work_orders ${whereSql}
      GROUP BY property_type, property_id, property_name
      ORDER BY total_cost DESC, order_count DESC, property_name ASC`,
    params,
  )

  ok(res, { list })
})

// ==================== 导出（须在 /:id 之前注册） ====================

workOrderRouter.get(
  '/export',
  requirePermission('workOrder', 'export'),
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query as Record<string, unknown>)
    const { sql: whereSql, params } = buildWhere(filters, true)

    const rows = getAll<Record<string, unknown>>(
      `SELECT * FROM work_orders ${whereSql} ORDER BY id DESC`,
      params,
    )

    logOperation(req, 'workOrder', 'export', '报修工单台账', `导出 ${rows.length} 条`)

    await exportExcel(
      res,
      stampedName('报修工单台账'),
      '报修工单',
      [
        { header: '工单号', key: 'order_no', width: 18 },
        {
          header: '状态',
          key: 'status',
          width: 12,
          value: (r) => STATUS_LABEL[r.status as WorkOrderStatus] ?? String(r.status ?? ''),
        },
        {
          header: '业态',
          key: 'property_type',
          width: 10,
          value: (r) => PROPERTY_LABEL[r.property_type as PropertyType] ?? '',
        },
        { header: '报修房源', key: 'property_name', width: 30 },
        { header: '报修人', key: 'reporter', width: 16 },
        { header: '联系电话', key: 'phone', width: 16 },
        { header: '故障描述', key: 'fault_desc', width: 40 },
        { header: '维修人员', key: 'assignee', width: 14 },
        { header: '维修费用', key: 'cost', width: 12 },
        { header: '维修进度', key: 'progress', width: 32 },
        { header: '完工备注', key: 'finish_remark', width: 32 },
        { header: '报修时间', key: 'created_at', width: 20 },
      ],
      rows,
    )
  }),
)

// ==================== 详情 ====================

workOrderRouter.get('/:id', requirePermission('workOrder', 'view'), (req, res) => {
  const id = parseId(req.params.id, '工单 ID')
  const row = getOne<Record<string, unknown>>('SELECT * FROM work_orders WHERE id = ?', [id])
  if (!row) throw AppError.notFound('工单不存在')
  ok(res, mapRow(row))
})

// ==================== 新增 ====================

workOrderRouter.post(
  '/',
  requirePermission('workOrder', 'create'),
  asyncHandler(async (req, res) => {
    const data = validateBody(workOrderSchema, emptyToNull(req.body as Record<string, unknown>))
    const propertyName = resolvePropertyName(data.property_type, data.property_id)
    const images = JSON.stringify(data.images ?? [])

    // 单号生成与写入放在同一事务内，避免并发下取到同一序号
    const create = db.transaction(() => {
      const orderNo = nextOrderNo()
      const info = db
        .prepare(
          `INSERT INTO work_orders (
             order_no, property_type, property_id, property_name,
             reporter, phone, fault_desc, images, status, cost, created_at, updated_at
           ) VALUES (
             @order_no, @property_type, @property_id, @property_name,
             @reporter, @phone, @fault_desc, @images, 'pending', 0,
             datetime('now','localtime'), datetime('now','localtime')
           )`,
        )
        .run({
          order_no: orderNo,
          property_type: data.property_type,
          property_id: data.property_id ?? null,
          property_name: propertyName,
          reporter: data.reporter,
          phone: data.phone ?? null,
          fault_desc: data.fault_desc,
          images,
        } as never)

      return { id: Number(info.lastInsertRowid), orderNo }
    })

    const { id, orderNo } = create()
    logOperation(req, 'workOrder', 'create', orderNo, `登记报修工单（${propertyName ?? '未关联房源'}）`)
    ok(res, { id, order_no: orderNo })
  }),
)

// ==================== 编辑基础信息 ====================

workOrderRouter.put(
  '/:id',
  requirePermission('workOrder', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '工单 ID')
    const current = getOne<{ order_no: string }>('SELECT order_no FROM work_orders WHERE id = ?', [id])
    if (!current) throw AppError.notFound('工单不存在')

    const data = validateBody(workOrderSchema, emptyToNull(req.body as Record<string, unknown>))
    const propertyName = resolvePropertyName(data.property_type, data.property_id)

    db.prepare(
      `UPDATE work_orders SET
         property_type = @property_type, property_id = @property_id, property_name = @property_name,
         reporter = @reporter, phone = @phone, fault_desc = @fault_desc, images = @images,
         updated_at = datetime('now','localtime')
       WHERE id = @id`,
    ).run({
      property_type: data.property_type,
      property_id: data.property_id ?? null,
      property_name: propertyName,
      reporter: data.reporter,
      phone: data.phone ?? null,
      fault_desc: data.fault_desc,
      images: JSON.stringify(data.images ?? []),
      id,
    } as never)

    logOperation(req, 'workOrder', 'edit', current.order_no, '修改工单基础信息')
    ok(res, { success: true })
  }),
)

// ==================== 状态流转 / 维修进度更新 ====================

workOrderRouter.put(
  '/:id/status',
  requirePermission('workOrder', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '工单 ID')
    const data = validateBody(statusSchema, emptyToNull(req.body as Record<string, unknown>))

    const current = getOne<{
      order_no: string
      status: WorkOrderStatus
      assignee: string | null
      cost: number
      finish_remark: string | null
    }>('SELECT order_no, status, assignee, cost, finish_remark FROM work_orders WHERE id = ?', [id])
    if (!current) throw AppError.notFound('工单不存在')

    assertTransition(current.status, data.status)

    // 未传的字段沿用原值，支持「只补充进度」这类局部更新
    const assignee = data.assignee ?? current.assignee
    const cost = data.cost ?? current.cost
    const finishRemark = data.finish_remark ?? current.finish_remark

    if (data.status === 'repairing' && !assignee) {
      throw AppError.badRequest('派单前请先指定维修人员')
    }
    if (data.status === 'done' && !data.finish_remark) {
      throw AppError.badRequest('完工时请填写完工备注')
    }

    db.prepare(
      `UPDATE work_orders SET
         status = @status, assignee = @assignee, cost = @cost,
         progress = COALESCE(@progress, progress), finish_remark = @finish_remark,
         updated_at = datetime('now','localtime')
       WHERE id = @id`,
    ).run({
      status: data.status,
      assignee,
      cost,
      progress: data.progress ?? null,
      finish_remark: finishRemark,
      id,
    } as never)

    const detail =
      current.status === data.status
        ? '更新维修进度'
        : `状态变更为「${STATUS_LABEL[data.status]}」`
    logOperation(req, 'workOrder', 'edit', current.order_no, detail)
    ok(res, { success: true })
  }),
)

// ==================== 删除 ====================

workOrderRouter.delete(
  '/:id',
  requirePermission('workOrder', 'delete'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '工单 ID')
    const row = getOne<{ order_no: string }>('SELECT order_no FROM work_orders WHERE id = ?', [id])
    if (!row) throw AppError.notFound('工单不存在')

    db.prepare('DELETE FROM work_orders WHERE id = ?').run(id)
    logOperation(req, 'workOrder', 'delete', row.order_no, '删除报修工单')
    ok(res, { success: true })
  }),
)
