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

export const factoryRouter = Router()
factoryRouter.use(authRequired)

/** 数据库列 → 前端展示字段的直通映射，接口统一使用 snake_case */
const FIELDS = [
  'name',
  'address',
  'total_area',
  'divisible_area',
  'floor_height',
  'floor_load',
  'floor_type',
  'transformer_capacity',
  'has_crane',
  'crane_tonnage',
  'fire_rating',
  'env_approved',
  'independent_yard',
  'dorm_area',
  'yard_area',
  'truck_access',
  'forbidden_industry',
  'rent_price',
  'property_fee',
  'water_price',
  'electric_price',
  'min_lease_months',
  'allow_sublet',
  'status',
  'images',
  'attachments',
  'remark',
] as const

const num = z.coerce.number().nonnegative().default(0)
const bit = z.coerce.number().int().min(0).max(1).default(0)

const factorySchema = z.object({
  name: z.string().min(1, '请输入房源名称'),
  address: z.string().min(1, '请输入详细地址'),
  total_area: num,
  divisible_area: num.default(0),
  floor_height: z.coerce.number().nonnegative().nullish(),
  floor_load: z.coerce.number().nonnegative().nullish(),
  floor_type: z.string().nullish(),
  transformer_capacity: z.coerce.number().nonnegative().nullish(),
  has_crane: bit,
  crane_tonnage: z.coerce.number().nonnegative().nullish(),
  fire_rating: z.string().nullish(),
  env_approved: bit,
  independent_yard: bit,
  dorm_area: z.coerce.number().nonnegative().nullish(),
  yard_area: z.coerce.number().nonnegative().nullish(),
  truck_access: z.string().nullish(),
  forbidden_industry: z.string().nullish(),
  rent_price: num,
  property_fee: num,
  water_price: z.coerce.number().nonnegative().nullish(),
  electric_price: z.coerce.number().nonnegative().nullish(),
  min_lease_months: z.coerce.number().int().nonnegative().default(12),
  allow_sublet: bit,
  status: z.enum(['vacant', 'rented', 'disabled']).default('vacant'),
  images: z.array(z.string()).default([]),
  attachments: z.array(z.string()).default([]),
  remark: z.string().nullish(),
})

function serializeArrayFields<T extends Record<string, unknown>>(row: T): T {
  const output = { ...row } as Record<string, unknown>
  for (const field of ['images', 'attachments']) {
    const raw = output[field]
    if (typeof raw === 'string') {
      try {
        output[field] = JSON.parse(raw)
      } catch {
        output[field] = []
      }
    }
  }
  return output as T
}

/** 列表：支持关键词、状态、面积区间、行车 / 环评等专属参数筛选 */
factoryRouter.get(
  '/',
  requirePermission('property', 'view'),
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
      where.push('(name LIKE ? OR address LIKE ? OR code LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    }

    const status = String(req.query.status ?? '').trim()
    if (status) {
      where.push('status = ?')
      params.push(status)
    }

    const fireRating = String(req.query.fire_rating ?? '').trim()
    if (fireRating) {
      where.push('fire_rating = ?')
      params.push(fireRating)
    }

    if (req.query.has_crane === '1') where.push('has_crane = 1')
    if (req.query.env_approved === '1') where.push('env_approved = 1')

    const minArea = Number(req.query.min_area)
    if (Number.isFinite(minArea) && minArea > 0) {
      where.push('total_area >= ?')
      params.push(minArea)
    }
    const maxArea = Number(req.query.max_area)
    if (Number.isFinite(maxArea) && maxArea > 0) {
      where.push('total_area <= ?')
      params.push(maxArea)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const total = db.prepare(`SELECT COUNT(*) AS c FROM factories ${whereSql}`).get(...(params as never[])) as { c: number }
    const rows = getAll<Record<string, unknown>>(
      `SELECT * FROM factories ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    ok(res, {
      list: rows.map(serializeArrayFields),
      total: total.c,
      page,
      pageSize,
    })
  }),
)

/** 下拉选项：给租约表单选择房源用，只返回在租/空置的房源 */
factoryRouter.get('/options', requirePermission('property', 'view'), (_req, res) => {
  const rows = getAll(
    `SELECT id, code, name, total_area, rent_price, property_fee, status
       FROM factories WHERE status != 'disabled' ORDER BY id`,
  )
  ok(res, rows)
})

/** 导出 Excel */
factoryRouter.get(
  '/export',
  requirePermission('property', 'export'),
  asyncHandler(async (req, res) => {
    const rows = getAll<Record<string, unknown>>('SELECT * FROM factories ORDER BY id ASC')

    logOperation(req, 'property', 'export', '厂房房源', `导出 ${rows.length} 条`)

    await exportExcel(
      res,
      stampedName('厂房房源'),
      '厂房房源',
      [
        { header: '房源编号', key: 'code', width: 12 },
        { header: '房源名称', key: 'name', width: 22 },
        { header: '详细地址', key: 'address', width: 36 },
        { header: '建筑面积(㎡)', key: 'total_area', width: 14 },
        { header: '可分割面积(㎡)', key: 'divisible_area', width: 16 },
        { header: '层高(m)', key: 'floor_height', width: 10 },
        { header: '地面承重(t/㎡)', key: 'floor_load', width: 16 },
        { header: '地坪类型', key: 'floor_type', width: 18 },
        { header: '变压器容量(kVA)', key: 'transformer_capacity', width: 18 },
        { header: '有无行车', key: 'has_crane', width: 10, value: (r) => (r.has_crane ? '有' : '无') },
        { header: '行车吨位(t)', key: 'crane_tonnage', width: 12 },
        { header: '消防等级', key: 'fire_rating', width: 12 },
        { header: '可否环评', key: 'env_approved', width: 10, value: (r) => (r.env_approved ? '可' : '否') },
        { header: '独门独院', key: 'independent_yard', width: 10, value: (r) => (r.independent_yard ? '是' : '否') },
        { header: '配套宿舍(㎡)', key: 'dorm_area', width: 14 },
        { header: '空地面积(㎡)', key: 'yard_area', width: 14 },
        { header: '大车进出条件', key: 'truck_access', width: 30 },
        { header: '禁止入驻行业', key: 'forbidden_industry', width: 28 },
        { header: '租金单价(元/㎡/月)', key: 'rent_price', width: 18 },
        { header: '物业费标准', key: 'property_fee', width: 14 },
        { header: '最短租期(月)', key: 'min_lease_months', width: 14 },
        { header: '允许分割转租', key: 'allow_sublet', width: 14, value: (r) => (r.allow_sublet ? '允许' : '不允许') },
        {
          header: '状态',
          key: 'status',
          width: 12,
          value: (r) =>
            ({ vacant: '待出租', rented: '已出租', disabled: '空置停用' })[String(r.status)] ?? '',
        },
      ],
      rows,
    )
  }),
)

/** 详情 */
factoryRouter.get(
  '/:id',
  requirePermission('property', 'view'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '厂房 ID')
    const row = getOne<Record<string, unknown>>('SELECT * FROM factories WHERE id = ?', [id])
    if (!row) throw AppError.notFound('厂房房源不存在')

    const leaseCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM lease_items li
           JOIN leases l ON l.id = li.lease_id
          WHERE li.property_type = 'factory' AND li.property_id = ?
            AND l.status IN ('active','expiring')`,
      )
      .get(id) as { c: number }

    ok(res, { ...serializeArrayFields(row), active_lease_count: leaseCount.c })
  }),
)

/** 新增 */
factoryRouter.post(
  '/',
  requirePermission('property', 'create'),
  asyncHandler(async (req, res) => {
    const data = emptyToNull(validateBody(factorySchema, req.body))

    const maxCode = db
      .prepare("SELECT code FROM factories ORDER BY id DESC LIMIT 1")
      .get() as { code: string } | undefined
    const nextSeq = maxCode ? Number(maxCode.code.replace(/\D/g, '')) + 1 : 1
    const code = `CF-${String(nextSeq).padStart(3, '0')}`

    const columns = ['code', ...FIELDS]
    const params = {
      ...toSqlParams(data as unknown as Record<string, unknown>, FIELDS),
      code,
      images: JSON.stringify(data.images ?? []),
      attachments: JSON.stringify(data.attachments ?? []),
    }
    const placeholders = columns.map((c) => `@${c}`).join(', ')

    const info = db
      .prepare(`INSERT INTO factories (${columns.join(', ')}) VALUES (${placeholders})`)
      .run(params as never)

    const id = Number(info.lastInsertRowid)
    logOperation(req, 'property', 'create', code, `新增厂房房源「${data.name}」`)

    ok(res, { id, code })
  }),
)

/** 编辑 */
factoryRouter.put(
  '/:id',
  requirePermission('property', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '厂房 ID')
    const exists = getOne('SELECT id, code FROM factories WHERE id = ?', [id])
    if (!exists) throw AppError.notFound('厂房房源不存在')

    const data = emptyToNull(validateBody(factorySchema, req.body))
    const params = {
      ...toSqlParams(data as unknown as Record<string, unknown>, FIELDS),
      id,
      images: JSON.stringify(data.images ?? []),
      attachments: JSON.stringify(data.attachments ?? []),
    }
    const assignments = FIELDS.map((c) => `${c} = @${c}`).join(', ')

    db.prepare(
      `UPDATE factories SET ${assignments}, updated_at = datetime('now','localtime') WHERE id = @id`,
    ).run(params as never)

    logOperation(req, 'property', 'edit', String((exists as { code: string }).code), `修改厂房房源「${data.name}」`)
    ok(res, { success: true })
  }),
)

/** 删除：有生效租约时禁止删除，避免数据悬空 */
factoryRouter.delete(
  '/:id',
  requirePermission('property', 'delete'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '厂房 ID')
    const row = getOne<{ code: string; name: string }>('SELECT code, name FROM factories WHERE id = ?', [id])
    if (!row) throw AppError.notFound('厂房房源不存在')

    const active = db
      .prepare(
        `SELECT COUNT(*) AS c FROM lease_items li
           JOIN leases l ON l.id = li.lease_id
          WHERE li.property_type = 'factory' AND li.property_id = ?
            AND l.status IN ('active','expiring')`,
      )
      .get(id) as { c: number }

    if (active.c > 0) {
      throw AppError.conflict('该厂房存在生效中的租约，请先处理租约后再删除')
    }

    db.prepare('DELETE FROM factories WHERE id = ?').run(id)
    logOperation(req, 'property', 'delete', row.code, `删除厂房房源「${row.name}」`)
    ok(res, { success: true })
  }),
)
