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

/** 楼栋表列名，用于构造 SQL 命名参数 */
const BUILDING_COLUMNS = ['name', 'floors', 'address', 'has_elevator', 'remark'] as const

/** 房间表列名（不含自增 id 与 code） */
const ROOM_COLUMNS = [
  'building_id',
  'floor',
  'room_no',
  'layout',
  'area',
  'orientation',
  'has_elevator',
  'furniture',
  'allow_pet',
  'occupancy_limit',
  'monthly_rent',
  'deposit_amount',
  'property_fee',
  'water_price',
  'electric_price',
  'utility_type',
  'status',
  'remark',
] as const

export const apartmentRouter = Router()
apartmentRouter.use(authRequired)

const STATUS_LABEL: Record<string, string> = {
  vacant: '空置',
  rented: '已租',
  repair: '待维修',
}

// ==================== 楼栋 ====================

const buildingSchema = z.object({
  name: z.string().min(1, '请输入楼栋名称'),
  floors: z.coerce.number().int().min(1, '楼层数至少为 1').max(60),
  address: z.string().nullish(),
  has_elevator: z.coerce.number().int().min(0).max(1).default(0),
  remark: z.string().nullish(),
})

/** 楼栋列表（含房间数与空置数，供左侧树展示） */
apartmentRouter.get('/buildings', requirePermission('property', 'view'), (_req, res) => {
  const rows = getAll(`
    SELECT b.*,
           (SELECT COUNT(*) FROM apartments a WHERE a.building_id = b.id) AS room_count,
           (SELECT COUNT(*) FROM apartments a WHERE a.building_id = b.id AND a.status = 'rented') AS rented_count,
           (SELECT COUNT(*) FROM apartments a WHERE a.building_id = b.id AND a.status = 'vacant') AS vacant_count,
           (SELECT COUNT(*) FROM apartments a WHERE a.building_id = b.id AND a.status = 'repair') AS repair_count
      FROM buildings b
     ORDER BY b.id ASC
  `)
  ok(res, rows)
})

apartmentRouter.post(
  '/buildings',
  requirePermission('property', 'create'),
  asyncHandler(async (req, res) => {
    const data = emptyToNull(validateBody(buildingSchema, req.body))
    const dup = getOne('SELECT id FROM buildings WHERE name = ?', [data.name])
    if (dup) throw AppError.conflict('该楼栋名称已存在')

    const info = db
      .prepare('INSERT INTO buildings (name, floors, address, has_elevator, remark) VALUES (@name, @floors, @address, @has_elevator, @remark)')
      .run(toSqlParams(data, BUILDING_COLUMNS) as never)

    logOperation(req, 'property', 'create', data.name, `新增公寓楼栋「${data.name}」`)
    ok(res, { id: Number(info.lastInsertRowid) })
  }),
)

apartmentRouter.put(
  '/buildings/:id',
  requirePermission('property', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '楼栋 ID')
    if (!getOne('SELECT id FROM buildings WHERE id = ?', [id])) throw AppError.notFound('楼栋不存在')

    const data = emptyToNull(validateBody(buildingSchema, req.body))
    const dup = getOne('SELECT id FROM buildings WHERE name = ? AND id != ?', [data.name, id])
    if (dup) throw AppError.conflict('该楼栋名称已被占用')

    db.prepare(
      'UPDATE buildings SET name = @name, floors = @floors, address = @address, has_elevator = @has_elevator, remark = @remark WHERE id = @id',
    ).run({ ...toSqlParams(data, BUILDING_COLUMNS), id } as never)

    logOperation(req, 'property', 'edit', data.name, '修改楼栋信息')
    ok(res, { success: true })
  }),
)

apartmentRouter.delete(
  '/buildings/:id',
  requirePermission('property', 'delete'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '楼栋 ID')
    const building = getOne<{ name: string }>('SELECT name FROM buildings WHERE id = ?', [id])
    if (!building) throw AppError.notFound('楼栋不存在')

    const roomCount = db
      .prepare('SELECT COUNT(*) AS c FROM apartments WHERE building_id = ?')
      .get(id) as { c: number }
    if (roomCount.c > 0) {
      throw AppError.conflict(`该楼栋下还有 ${roomCount.c} 个房间，请先删除房间`)
    }

    db.prepare('DELETE FROM buildings WHERE id = ?').run(id)
    logOperation(req, 'property', 'delete', building.name, '删除楼栋')
    ok(res, { success: true })
  }),
)

// ==================== 房间 ====================

const roomSchema = z.object({
  building_id: z.coerce.number().int().positive('请选择楼栋'),
  floor: z.coerce.number().int().min(1, '楼层至少为 1'),
  room_no: z.string().min(1, '请输入房间号'),
  layout: z.string().nullish(),
  area: z.coerce.number().nonnegative().default(0),
  orientation: z.string().nullish(),
  has_elevator: z.coerce.number().int().min(0).max(1).default(0),
  furniture: z.string().nullish(),
  allow_pet: z.coerce.number().int().min(0).max(1).default(0),
  occupancy_limit: z.coerce.number().int().nonnegative().nullish(),
  monthly_rent: z.coerce.number().nonnegative().default(0),
  deposit_amount: z.coerce.number().nonnegative().default(0),
  property_fee: z.coerce.number().nonnegative().default(0),
  water_price: z.coerce.number().nonnegative().nullish(),
  electric_price: z.coerce.number().nonnegative().nullish(),
  utility_type: z.enum(['civil', 'commercial']).default('civil'),
  status: z.enum(['vacant', 'rented', 'repair']).default('vacant'),
  remark: z.string().nullish(),
})

function buildRoomWhere(query: Record<string, unknown>) {
  const where: string[] = []
  const params: unknown[] = []

  const buildingId = Number(query.building_id)
  if (Number.isFinite(buildingId) && buildingId > 0) {
    where.push('building_id = ?')
    params.push(buildingId)
  }
  const floor = Number(query.floor)
  if (Number.isFinite(floor) && floor > 0) {
    where.push('floor = ?')
    params.push(floor)
  }
  const status = String(query.status ?? '').trim()
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  const keyword = String(query.keyword ?? '').trim()
  if (keyword) {
    where.push('(code LIKE ? OR room_no LIKE ? OR layout LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

/** 楼栋 → 楼层 → 房间 三级树 */
apartmentRouter.get('/tree', requirePermission('property', 'view'), (_req, res) => {
  const buildings = getAll<{ id: number; name: string; floors: number; has_elevator: number }>(
    'SELECT id, name, floors, has_elevator FROM buildings ORDER BY id',
  )
  const rooms = getAll<Record<string, unknown>>('SELECT * FROM apartments ORDER BY building_id, floor, room_no')

  const tree = buildings.map((b) => {
    const own = rooms.filter((r) => r.building_id === b.id)
    const floors = Array.from(new Set(own.map((r) => Number(r.floor)))).sort((a, b2) => a - b2)

    return {
      ...b,
      room_count: own.length,
      rented_count: own.filter((r) => r.status === 'rented').length,
      vacant_count: own.filter((r) => r.status === 'vacant').length,
      children: floors.map((f) => ({
        floor: f,
        label: `${f} 层`,
        rooms: own.filter((r) => Number(r.floor) === f),
      })),
    }
  })

  ok(res, tree)
})

/** 房间列表（分页 + 筛选） */
apartmentRouter.get(
  '/rooms',
  requirePermission('property', 'view'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePageQuery(
      req.query as Record<string, unknown>,
      config.defaultPageSize,
      config.maxPageSize,
    )
    const { whereSql, params } = buildRoomWhere(req.query as Record<string, unknown>)

    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM apartments ${whereSql}`)
      .get(...(params as never[])) as { c: number }

    const list = getAll(
      `SELECT * FROM apartments ${whereSql} ORDER BY building_id, floor, room_no LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    ok(res, { list, total: total.c, page, pageSize })
  }),
)

/** 房间下拉选项：给租约表单选择多套公寓用 */
apartmentRouter.get('/rooms/options', requirePermission('property', 'view'), (_req, res) => {
  const rows = getAll(
    `SELECT id, code, building_name, floor, room_no, layout, area, monthly_rent, property_fee, status
       FROM apartments WHERE status != 'repair' ORDER BY building_id, floor, room_no`,
  )
  ok(res, rows)
})

/** 房间导出 */
apartmentRouter.get(
  '/rooms/export',
  requirePermission('property', 'export'),
  asyncHandler(async (req, res) => {
    const { whereSql, params } = buildRoomWhere(req.query as Record<string, unknown>)
    const rows = getAll<Record<string, unknown>>(
      `SELECT * FROM apartments ${whereSql} ORDER BY building_id, floor, room_no`,
      params,
    )

    logOperation(req, 'property', 'export', '公寓房源', `导出 ${rows.length} 条`)

    await exportExcel(
      res,
      stampedName('公寓房源'),
      '公寓房源',
      [
        { header: '房间编号', key: 'code', width: 14 },
        { header: '楼栋', key: 'building_name', width: 20 },
        { header: '楼层', key: 'floor', width: 8 },
        { header: '房间号', key: 'room_no', width: 10 },
        { header: '户型', key: 'layout', width: 18 },
        { header: '面积(㎡)', key: 'area', width: 10 },
        { header: '朝向', key: 'orientation', width: 10 },
        { header: '电梯', key: 'has_elevator', width: 8, value: (r) => (r.has_elevator ? '有' : '无') },
        { header: '家具家电', key: 'furniture', width: 34 },
        { header: '允许养宠', key: 'allow_pet', width: 10, value: (r) => (r.allow_pet ? '允许' : '不允许') },
        { header: '入住限制(人)', key: 'occupancy_limit', width: 14 },
        { header: '月租金(元)', key: 'monthly_rent', width: 12 },
        { header: '押金(元)', key: 'deposit_amount', width: 12 },
        { header: '物业费(元)', key: 'property_fee', width: 12 },
        { header: '水费单价', key: 'water_price', width: 10 },
        { header: '电费单价', key: 'electric_price', width: 10 },
        { header: '水电性质', key: 'utility_type', width: 12, value: (r) => (r.utility_type === 'civil' ? '民用' : '商用') },
        { header: '状态', key: 'status', width: 10, value: (r) => STATUS_LABEL[String(r.status)] ?? '' },
      ],
      rows,
    )
  }),
)

/** 新增房间 */
apartmentRouter.post(
  '/rooms',
  requirePermission('property', 'create'),
  asyncHandler(async (req, res) => {
    const data = emptyToNull(validateBody(roomSchema, req.body))

    const building = getOne<{ name: string; has_elevator: number }>(
      'SELECT name, has_elevator FROM buildings WHERE id = ?',
      [data.building_id],
    )
    if (!building) throw AppError.notFound('楼栋不存在')

    const dup = getOne('SELECT id FROM apartments WHERE building_id = ? AND room_no = ?', [
      data.building_id,
      data.room_no,
    ])
    if (dup) throw AppError.conflict(`${building.name} 的 ${data.room_no} 房间已存在`)

    const buildingSeq = (getOne<{ c: number }>('SELECT COUNT(*) AS c FROM buildings WHERE id <= ?', [data.building_id])?.c) ?? 1
    const code = `GY${buildingSeq}-${data.room_no}`

    const info = db
      .prepare(`
        INSERT INTO apartments (
          code, building_id, building_name, floor, room_no, layout, area, orientation,
          has_elevator, furniture, allow_pet, occupancy_limit,
          monthly_rent, deposit_amount, property_fee, water_price, electric_price,
          utility_type, status, remark
        ) VALUES (
          @code, @building_id, @building_name, @floor, @room_no, @layout, @area, @orientation,
          @has_elevator, @furniture, @allow_pet, @occupancy_limit,
          @monthly_rent, @deposit_amount, @property_fee, @water_price, @electric_price,
          @utility_type, @status, @remark
        )
      `)
      .run({ ...toSqlParams(data, ROOM_COLUMNS), code, building_name: building.name } as never)

    logOperation(req, 'property', 'create', code, `新增公寓房间 ${building.name} ${data.room_no}`)
    ok(res, { id: Number(info.lastInsertRowid), code })
  }),
)

/** 编辑房间 */
apartmentRouter.put(
  '/rooms/:id',
  requirePermission('property', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '房间 ID')
    if (!getOne('SELECT id FROM apartments WHERE id = ?', [id])) throw AppError.notFound('房间不存在')

    const data = emptyToNull(validateBody(roomSchema, req.body))
    const building = getOne<{ name: string }>('SELECT name FROM buildings WHERE id = ?', [data.building_id])
    if (!building) throw AppError.notFound('楼栋不存在')

    const dup = getOne('SELECT id FROM apartments WHERE building_id = ? AND room_no = ? AND id != ?', [
      data.building_id,
      data.room_no,
      id,
    ])
    if (dup) throw AppError.conflict(`${building.name} 的 ${data.room_no} 房间已存在`)

    db.prepare(`
      UPDATE apartments SET
        building_id = @building_id, building_name = @building_name, floor = @floor, room_no = @room_no,
        layout = @layout, area = @area, orientation = @orientation, has_elevator = @has_elevator,
        furniture = @furniture, allow_pet = @allow_pet, occupancy_limit = @occupancy_limit,
        monthly_rent = @monthly_rent, deposit_amount = @deposit_amount, property_fee = @property_fee,
        water_price = @water_price, electric_price = @electric_price, utility_type = @utility_type,
        status = @status, remark = @remark, updated_at = datetime('now','localtime')
      WHERE id = @id
    `).run({ ...toSqlParams(data, ROOM_COLUMNS), building_name: building.name, id } as never)

    logOperation(req, 'property', 'edit', String(id), `修改公寓房间 ${building.name} ${data.room_no}`)
    ok(res, { success: true })
  }),
)

/** 批量录入：按「楼栋 + 楼层区间 + 每层房号数」一次性生成房间 */
const batchCreateSchema = z.object({
  building_id: z.coerce.number().int().positive('请选择楼栋'),
  floor_from: z.coerce.number().int().min(1),
  floor_to: z.coerce.number().int().min(1),
  per_floor: z.coerce.number().int().min(1).max(50),
  layout: z.string().default('一室一卫'),
  area: z.coerce.number().nonnegative().default(32),
  monthly_rent: z.coerce.number().nonnegative().default(1200),
  property_fee: z.coerce.number().nonnegative().default(120),
  water_price: z.coerce.number().nonnegative().default(3.2),
  electric_price: z.coerce.number().nonnegative().default(0.98),
  utility_type: z.enum(['civil', 'commercial']).default('civil'),
  furniture: z.string().nullish(),
})

apartmentRouter.post(
  '/rooms/batch',
  requirePermission('property', 'create'),
  asyncHandler(async (req, res) => {
    const data = emptyToNull(validateBody(batchCreateSchema, req.body))

    if (data.floor_to < data.floor_from) {
      throw AppError.badRequest('结束楼层不能小于起始楼层')
    }

    const building = getOne<{ name: string; has_elevator: number }>(
      'SELECT name, has_elevator FROM buildings WHERE id = ?',
      [data.building_id],
    )
    if (!building) throw AppError.notFound('楼栋不存在')

    const buildingSeq =
      (getOne<{ c: number }>('SELECT COUNT(*) AS c FROM buildings WHERE id <= ?', [data.building_id])?.c) ?? 1

    const insert = db.prepare(`
      INSERT INTO apartments (
        code, building_id, building_name, floor, room_no, layout, area, orientation,
        has_elevator, furniture, allow_pet, occupancy_limit,
        monthly_rent, deposit_amount, property_fee, water_price, electric_price,
        utility_type, status, remark
      ) VALUES (
        @code, @building_id, @building_name, @floor, @room_no, @layout, @area, NULL,
        @has_elevator, @furniture, 0, 2,
        @monthly_rent, @deposit_amount, @property_fee, @water_price, @electric_price,
        @utility_type, 'vacant', '批量录入生成'
      )
    `)

    const existing = new Set(
      (
        getAll<{ room_no: string }>('SELECT room_no FROM apartments WHERE building_id = ?', [
          data.building_id,
        ]) as Array<{ room_no: string }>
      ).map((r) => r.room_no),
    )

    let created = 0
    let skipped = 0

    const runBatch = db.transaction(() => {
      for (let floor = data.floor_from; floor <= data.floor_to; floor += 1) {
        for (let idx = 1; idx <= data.per_floor; idx += 1) {
          const roomNo = `${floor}${String(idx).padStart(2, '0')}`
          if (existing.has(roomNo)) {
            skipped += 1
            continue
          }
          // 显式列出每个字段：批量录入的入参只覆盖部分列，
          // 其余必须补默认值，否则 NOT NULL 约束会失败
          insert.run({
            code: `GY${buildingSeq}-${roomNo}`,
            building_id: data.building_id,
            building_name: building.name,
            floor,
            room_no: roomNo,
            layout: data.layout ?? null,
            area: data.area ?? 0,
            orientation: null,
            has_elevator: building.has_elevator ?? 0,
            furniture: data.furniture ?? null,
            allow_pet: 0,
            occupancy_limit: 2,
            monthly_rent: data.monthly_rent ?? 0,
            deposit_amount: (data.monthly_rent ?? 0) * 2,
            property_fee: data.property_fee ?? 0,
            water_price: data.water_price ?? null,
            electric_price: data.electric_price ?? null,
            utility_type: data.utility_type ?? 'civil',
            status: 'vacant',
            remark: '批量录入生成',
          } as never)
          existing.add(roomNo)
          created += 1
        }
      }
    })

    runBatch()

    logOperation(
      req,
      'property',
      'create',
      building.name,
      `批量录入房间 ${created} 间（跳过已存在 ${skipped} 间）`,
    )
    ok(res, { created, skipped })
  }),
)

/** 批量修改：租金 / 押金 / 物业费 / 状态 */
const batchUpdateSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, '请至少选择一个房间'),
  monthly_rent: z.coerce.number().nonnegative().optional(),
  deposit_amount: z.coerce.number().nonnegative().optional(),
  property_fee: z.coerce.number().nonnegative().optional(),
  status: z.enum(['vacant', 'rented', 'repair']).optional(),
})

apartmentRouter.post(
  '/rooms/batch-update',
  requirePermission('property', 'edit'),
  asyncHandler(async (req, res) => {
    const data = validateBody(batchUpdateSchema, req.body)

    const assignments: string[] = []
    const params: Record<string, unknown> = {}
    if (data.monthly_rent !== undefined) {
      assignments.push('monthly_rent = @monthly_rent')
      params.monthly_rent = data.monthly_rent
    }
    if (data.deposit_amount !== undefined) {
      assignments.push('deposit_amount = @deposit_amount')
      params.deposit_amount = data.deposit_amount
    }
    if (data.property_fee !== undefined) {
      assignments.push('property_fee = @property_fee')
      params.property_fee = data.property_fee
    }
    if (data.status !== undefined) {
      assignments.push('status = @status')
      params.status = data.status
    }

    if (assignments.length === 0) throw AppError.badRequest('没有需要修改的字段')

    const placeholders = data.ids.map((_, i) => `@id${i}`).join(', ')
    data.ids.forEach((id, i) => {
      params[`id${i}`] = id
    })

    const info = db
      .prepare(
        `UPDATE apartments SET ${assignments.join(', ')}, updated_at = datetime('now','localtime')
          WHERE id IN (${placeholders})`,
      )
      .run(params as never)

    logOperation(req, 'property', 'edit', `房间 ${data.ids.length} 间`, '批量修改公寓房间参数')
    ok(res, { updated: info.changes })
  }),
)

/** 删除房间 */
apartmentRouter.delete(
  '/rooms/:id',
  requirePermission('property', 'delete'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '房间 ID')
    const room = getOne<{ code: string; room_no: string; building_name: string }>(
      'SELECT code, room_no, building_name FROM apartments WHERE id = ?',
      [id],
    )
    if (!room) throw AppError.notFound('房间不存在')

    const active = db
      .prepare(
        `SELECT COUNT(*) AS c FROM lease_items li
           JOIN leases l ON l.id = li.lease_id
          WHERE li.property_type = 'apartment' AND li.property_id = ?
            AND l.status IN ('active','expiring')`,
      )
      .get(id) as { c: number }

    if (active.c > 0) throw AppError.conflict('该房间存在生效中的租约，请先处理租约后再删除')

    db.prepare('DELETE FROM apartments WHERE id = ?').run(id)
    logOperation(req, 'property', 'delete', room.code, `删除公寓房间 ${room.building_name} ${room.room_no}`)
    ok(res, { success: true })
  }),
)
