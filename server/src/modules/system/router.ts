import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { config } from '../../config'
import { db, getAll, getOne } from '../../db'
import { authRequired } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/error'
import { requirePermission } from '../../middleware/permission'
import { logOperation } from '../../utils/operationLog'
import { AppError, ok, parsePageQuery } from '../../utils/response'
import { emptyToNull, parseId, toSqlParams, validateBody } from '../../utils/validate'

const ROLE_COLUMNS = ['name', 'code', 'permissions', 'remark'] as const
const USER_COLUMNS = ['username', 'password', 'real_name', 'phone', 'role_id', 'status'] as const

export const systemRouter = Router()
systemRouter.use(authRequired)

// ==================== 系统基础设置 ====================

systemRouter.get('/settings', requirePermission('system', 'view'), (_req, res) => {
  ok(res, getAll('SELECT * FROM settings ORDER BY key'))
})

systemRouter.put(
  '/settings',
  requirePermission('system', 'edit'),
  asyncHandler(async (req, res) => {
    const schema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    const payload = validateBody(schema, req.body)

    const update = db.prepare(
      "UPDATE settings SET value = ?, updated_at = datetime('now','localtime') WHERE key = ?",
    )

    const run = db.transaction(() => {
      for (const [key, value] of Object.entries(payload)) {
        update.run(String(value), key)
      }
    })
    run()

    logOperation(req, 'system', 'edit', '基础参数', `更新 ${Object.keys(payload).length} 项配置`)
    ok(res, { success: true })
  }),
)

// ==================== 公告 ====================

const announcementSchema = z.object({
  title: z.string().min(1, '请输入公告标题'),
  content: z.string().min(1, '请输入公告内容'),
  category: z.enum(['notice', 'water', 'power', 'safety', 'rule']).default('notice'),
  is_top: z.coerce.number().int().min(0).max(1).default(0),
})

systemRouter.get('/announcements', requirePermission('system', 'view'), (req, res) => {
  const { page, pageSize, offset } = parsePageQuery(
    req.query as Record<string, unknown>,
    config.defaultPageSize,
    config.maxPageSize,
  )

  const total = db.prepare('SELECT COUNT(*) AS c FROM announcements').get() as { c: number }
  const list = getAll(
    'SELECT * FROM announcements ORDER BY is_top DESC, id DESC LIMIT ? OFFSET ?',
    [pageSize, offset],
  )

  ok(res, { list, total: total.c, page, pageSize })
})

systemRouter.post(
  '/announcements',
  requirePermission('system', 'create'),
  asyncHandler(async (req, res) => {
    const data = validateBody(announcementSchema, req.body)

    const info = db
      .prepare(
        'INSERT INTO announcements (title, content, category, is_top, publisher) VALUES (@title, @content, @category, @is_top, @publisher)',
      )
      .run({ ...data, publisher: req.user!.realName } as never)

    logOperation(req, 'system', 'create', data.title, '发布公告')
    ok(res, { id: Number(info.lastInsertRowid) })
  }),
)

systemRouter.put(
  '/announcements/:id',
  requirePermission('system', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '公告 ID')
    if (!getOne('SELECT id FROM announcements WHERE id = ?', [id])) throw AppError.notFound('公告不存在')

    const data = validateBody(announcementSchema, req.body)
    db.prepare(
      'UPDATE announcements SET title = @title, content = @content, category = @category, is_top = @is_top WHERE id = @id',
    ).run({ ...data, id } as never)

    logOperation(req, 'system', 'edit', data.title, '修改公告')
    ok(res, { success: true })
  }),
)

systemRouter.delete(
  '/announcements/:id',
  requirePermission('system', 'delete'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '公告 ID')
    const row = getOne<{ title: string }>('SELECT title FROM announcements WHERE id = ?', [id])
    if (!row) throw AppError.notFound('公告不存在')

    db.prepare('DELETE FROM announcements WHERE id = ?').run(id)
    logOperation(req, 'system', 'delete', row.title, '删除公告')
    ok(res, { success: true })
  }),
)

// ==================== 角色 ====================

const roleSchema = z.object({
  name: z.string().min(1, '请输入角色名称'),
  code: z.string().min(1, '请输入角色标识').regex(/^[a-z][a-z0-9_]*$/, '标识只能用小写字母、数字和下划线'),
  permissions: z.record(z.string(), z.array(z.string())).default({}),
  remark: z.string().nullish(),
})

systemRouter.get('/roles', requirePermission('system', 'view'), (_req, res) => {
  const rows = getAll<Record<string, unknown>>(
    `SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
       FROM roles r ORDER BY r.is_preset DESC, r.id`,
  )
  ok(res, rows.map((r) => ({ ...r, permissions: JSON.parse(String(r.permissions) || '{}') })))
})

systemRouter.post(
  '/roles',
  requirePermission('system', 'create'),
  asyncHandler(async (req, res) => {
    const data = emptyToNull(validateBody(roleSchema, req.body))

    if (getOne('SELECT id FROM roles WHERE code = ? OR name = ?', [data.code, data.name])) {
      throw AppError.conflict('角色标识或名称已存在')
    }

    const info = db
      .prepare('INSERT INTO roles (name, code, permissions, is_preset, remark) VALUES (@name, @code, @permissions, 0, @remark)')
      .run({
        ...toSqlParams(data, ROLE_COLUMNS),
        permissions: JSON.stringify(data.permissions ?? {}),
      } as never)

    logOperation(req, 'system', 'create', data.name, '新增角色')
    ok(res, { id: Number(info.lastInsertRowid) })
  }),
)

systemRouter.put(
  '/roles/:id',
  requirePermission('system', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '角色 ID')
    const role = getOne<{ name: string; is_preset: number }>('SELECT name, is_preset FROM roles WHERE id = ?', [id])
    if (!role) throw AppError.notFound('角色不存在')

    const data = emptyToNull(validateBody(roleSchema, req.body))

    // 预设角色允许调权限但禁止改标识，避免破坏代码里的 admin 判断
    if (role.is_preset === 1) {
      const preset = getOne<{ code: string }>('SELECT code FROM roles WHERE id = ?', [id])!
      if (data.code !== preset.code) {
        throw AppError.badRequest('预设角色的标识不可修改')
      }
    }

    const dup = getOne('SELECT id FROM roles WHERE (code = ? OR name = ?) AND id != ?', [
      data.code,
      data.name,
      id,
    ])
    if (dup) throw AppError.conflict('角色标识或名称已被占用')

    db.prepare(
      'UPDATE roles SET name = @name, code = @code, permissions = @permissions, remark = @remark WHERE id = @id',
    ).run({
      ...toSqlParams(data, ROLE_COLUMNS),
      permissions: JSON.stringify(data.permissions ?? {}),
      id,
    } as never)

    logOperation(req, 'system', 'edit', data.name, '修改角色权限')
    ok(res, { success: true })
  }),
)

systemRouter.delete(
  '/roles/:id',
  requirePermission('system', 'delete'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '角色 ID')
    const role = getOne<{ name: string; is_preset: number }>('SELECT name, is_preset FROM roles WHERE id = ?', [id])
    if (!role) throw AppError.notFound('角色不存在')
    if (role.is_preset === 1) throw AppError.badRequest('预设角色不可删除')

    const userCount = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role_id = ?').get(id) as { c: number }
    if (userCount.c > 0) throw AppError.conflict(`该角色下还有 ${userCount.c} 个账号，请先转移账号`)

    db.prepare('DELETE FROM roles WHERE id = ?').run(id)
    logOperation(req, 'system', 'delete', role.name, '删除角色')
    ok(res, { success: true })
  }),
)

// ==================== 账号 ====================

const userSchema = z.object({
  username: z.string().min(3, '账号至少 3 位'),
  real_name: z.string().min(1, '请输入姓名'),
  phone: z.string().nullish(),
  role_id: z.coerce.number().int().positive('请选择角色'),
  password: z.string().min(6, '密码至少 6 位').optional(),
  status: z.enum(['active', 'disabled']).default('active'),
})

systemRouter.get('/users', requirePermission('system', 'view'), (req, res) => {
  const { page, pageSize, offset } = parsePageQuery(
    req.query as Record<string, unknown>,
    config.defaultPageSize,
    config.maxPageSize,
  )

  const keyword = String(req.query.keyword ?? '').trim()
  const whereSql = keyword ? 'WHERE u.username LIKE ? OR u.real_name LIKE ? OR u.phone LIKE ?' : ''
  const params = keyword ? [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`] : []

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM users u ${whereSql}`)
    .get(...(params as never[])) as { c: number }

  const list = getAll(
    `SELECT u.id, u.username, u.real_name, u.phone, u.role_id, u.status, u.last_login_at, u.created_at,
            r.name AS role_name, r.code AS role_code
       FROM users u JOIN roles r ON r.id = u.role_id
       ${whereSql} ORDER BY u.id LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  ok(res, { list, total: total.c, page, pageSize })
})

systemRouter.post(
  '/users',
  requirePermission('system', 'create'),
  asyncHandler(async (req, res) => {
    const data = emptyToNull(validateBody(userSchema, req.body))

    if (getOne('SELECT id FROM users WHERE username = ?', [data.username])) {
      throw AppError.conflict('该账号已存在')
    }
    if (!getOne('SELECT id FROM roles WHERE id = ?', [data.role_id])) {
      throw AppError.badRequest('所选角色不存在')
    }

    const info = db
      .prepare(
        'INSERT INTO users (username, password, real_name, phone, role_id, status) VALUES (@username, @password, @real_name, @phone, @role_id, @status)',
      )
      .run({
        ...toSqlParams(data, USER_COLUMNS),
        password: bcrypt.hashSync(data.password ?? '123456', 10),
      } as never)

    logOperation(req, 'system', 'create', data.username, `新增账号「${data.real_name}」`)
    ok(res, { id: Number(info.lastInsertRowid) })
  }),
)

systemRouter.put(
  '/users/:id',
  requirePermission('system', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '账号 ID')
    if (!getOne('SELECT id FROM users WHERE id = ?', [id])) throw AppError.notFound('账号不存在')

    const data = emptyToNull(validateBody(userSchema, req.body))
    const dup = getOne('SELECT id FROM users WHERE username = ? AND id != ?', [data.username, id])
    if (dup) throw AppError.conflict('该账号名已被占用')

    db.prepare(
      `UPDATE users SET username = @username, real_name = @real_name, phone = @phone,
         role_id = @role_id, status = @status, updated_at = datetime('now','localtime')
       WHERE id = @id`,
    ).run({ username: data.username, real_name: data.real_name, phone: data.phone, role_id: data.role_id, status: data.status, id } as never)

    // 修改自己的账号或权限后，前端需重新拉取 /auth/me
    logOperation(req, 'system', 'edit', data.username, '修改账号信息')
    ok(res, { success: true })
  }),
)

systemRouter.put(
  '/users/:id/status',
  requirePermission('system', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '账号 ID')
    const schema = z.object({ status: z.enum(['active', 'disabled']) })
    const { status } = validateBody(schema, req.body)

    if (id === req.user!.id) throw AppError.badRequest('不能禁用当前登录的账号')

    const user = getOne<{ username: string }>('SELECT username FROM users WHERE id = ?', [id])
    if (!user) throw AppError.notFound('账号不存在')

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id)
    logOperation(req, 'system', 'edit', user.username, status === 'active' ? '启用账号' : '禁用账号')
    ok(res, { success: true })
  }),
)

systemRouter.post(
  '/users/:id/reset-password',
  requirePermission('system', 'edit'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '账号 ID')
    const user = getOne<{ username: string }>('SELECT username FROM users WHERE id = ?', [id])
    if (!user) throw AppError.notFound('账号不存在')

    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync('123456', 10), id)
    logOperation(req, 'system', 'edit', user.username, '重置密码为默认值')

    ok(res, { success: true, defaultPassword: '123456' })
  }),
)

systemRouter.delete(
  '/users/:id',
  requirePermission('system', 'delete'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '账号 ID')
    if (id === req.user!.id) throw AppError.badRequest('不能删除当前登录的账号')

    const user = getOne<{ username: string; real_name: string }>(
      'SELECT username, real_name FROM users WHERE id = ?',
      [id],
    )
    if (!user) throw AppError.notFound('账号不存在')

    db.prepare('DELETE FROM users WHERE id = ?').run(id)
    logOperation(req, 'system', 'delete', user.username, `删除账号「${user.real_name}」`)
    ok(res, { success: true })
  }),
)

// ==================== 操作日志 ====================

systemRouter.get('/logs', requirePermission('system', 'view'), (req, res) => {
  const { page, pageSize, offset } = parsePageQuery(
    req.query as Record<string, unknown>,
    config.defaultPageSize,
    config.maxPageSize,
  )

  const where: string[] = []
  const params: unknown[] = []

  const module = String(req.query.module ?? '').trim()
  if (module) {
    where.push('module = ?')
    params.push(module)
  }
  const keyword = String(req.query.keyword ?? '').trim()
  if (keyword) {
    where.push('(username LIKE ? OR target LIKE ? OR detail LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }
  const startDate = String(req.query.start_date ?? '').trim()
  if (startDate) {
    where.push('created_at >= ?')
    params.push(`${startDate} 00:00:00`)
  }
  const endDate = String(req.query.end_date ?? '').trim()
  if (endDate) {
    where.push('created_at <= ?')
    params.push(`${endDate} 23:59:59`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM operation_logs ${whereSql}`)
    .get(...(params as never[])) as { c: number }

  const list = getAll(
    `SELECT * FROM operation_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  ok(res, { list, total: total.c, page, pageSize })
})

// ==================== 站内消息 ====================

systemRouter.get('/notifications', (_req, res) => {
  const list = getAll('SELECT * FROM notifications ORDER BY is_read ASC, id DESC LIMIT 50')
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0').get() as {
    c: number
  }
  ok(res, { list, unread: unread.c })
})

systemRouter.post(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, '消息 ID')
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id)
    ok(res, { success: true })
  }),
)

systemRouter.post('/notifications/read-all', (_req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run()
  ok(res, { success: true })
})

// ==================== 占位模块（本期只读，结构已预留） ====================

systemRouter.get('/viewings', requirePermission('viewing', 'view'), (req, res) => {
  const { page, pageSize, offset } = parsePageQuery(
    req.query as Record<string, unknown>,
    config.defaultPageSize,
    config.maxPageSize,
  )
  const total = db.prepare('SELECT COUNT(*) AS c FROM viewings').get() as { c: number }
  const list = getAll('SELECT * FROM viewings ORDER BY id DESC LIMIT ? OFFSET ?', [pageSize, offset])
  ok(res, { list, total: total.c, page, pageSize })
})

systemRouter.get('/work-orders', requirePermission('workOrder', 'view'), (req, res) => {
  const { page, pageSize, offset } = parsePageQuery(
    req.query as Record<string, unknown>,
    config.defaultPageSize,
    config.maxPageSize,
  )
  const total = db.prepare('SELECT COUNT(*) AS c FROM work_orders').get() as { c: number }
  const list = getAll('SELECT * FROM work_orders ORDER BY id DESC LIMIT ? OFFSET ?', [pageSize, offset])
  ok(res, { list, total: total.c, page, pageSize })
})
