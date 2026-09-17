import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '../../db'
import { authRequired, loadAuthUser, signToken } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/error'
import { logOperation } from '../../utils/operationLog'
import { AppError, ok } from '../../utils/response'
import { validateBody } from '../../utils/validate'

export const authRouter = Router()

const loginSchema = z.object({
  username: z.string().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
})

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入原密码'),
  newPassword: z.string().min(6, '新密码至少 6 位'),
})

/** 登录：校验账号密码，签发 JWT */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = validateBody(loginSchema, req.body)

    const row = db
      .prepare('SELECT id, password, status FROM users WHERE username = ?')
      .get(username) as { id: number; password: string; status: string } | undefined

    if (!row || !bcrypt.compareSync(password, row.password)) {
      throw AppError.badRequest('账号或密码错误')
    }
    if (row.status !== 'active') {
      throw AppError.forbidden('该账号已被禁用，请联系管理员')
    }

    db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(
      row.id,
    )

    const user = loadAuthUser(row.id)
    if (!user) throw AppError.forbidden('账号状态异常')

    // 先把用户挂上，操作日志才能记录到真实操作人
    req.user = user
    logOperation(req, 'auth', 'login', username, '登录成功')

    ok(res, { token: signToken(row.id), user })
  }),
)

/** 获取当前登录用户（含角色权限，前端据此控制按钮可见性） */
authRouter.get('/me', authRequired, (req, res) => {
  ok(res, req.user)
})

/** 退出登录：JWT 无状态，服务端仅记录日志，前端清除本地令牌 */
authRouter.post('/logout', authRequired, (req, res) => {
  logOperation(req, 'auth', 'logout', req.user?.username, '退出登录')
  ok(res, { success: true })
})

/** 修改密码 */
authRouter.post(
  '/change-password',
  authRequired,
  asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = validateBody(changePasswordSchema, req.body)
    const userId = req.user!.id

    const row = db.prepare('SELECT password FROM users WHERE id = ?').get(userId) as
      | { password: string }
      | undefined

    if (!row || !bcrypt.compareSync(oldPassword, row.password)) {
      throw AppError.badRequest('原密码不正确')
    }

    db.prepare("UPDATE users SET password = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
      bcrypt.hashSync(newPassword, 10),
      userId,
    )

    logOperation(req, 'auth', 'change-password', req.user!.username, '修改登录密码')
    ok(res, { success: true })
  }),
)
