import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { db } from '../db'
import { AppError } from '../utils/response'

/** 登录用户上下文，挂在 req.user 上供后续中间件与业务使用 */
export interface AuthUser {
  id: number
  username: string
  realName: string
  roleId: number
  roleCode: string
  roleName: string
  /** 模块 → 允许的动作列表，如 { bill: ['view','export'] } */
  permissions: Record<string, string[]>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

interface TokenPayload {
  uid: number
}

/** 签发 Token */
export function signToken(userId: number): string {
  const payload: TokenPayload = { uid: userId }
  // expiresIn 在配置里是字符串字面量，这里显式断言为 SignOptions，
  // 否则会被 jsonwebtoken 的重载解析成 "none" 算法分支而报类型错误
  const options: jwt.SignOptions = { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  return jwt.sign(payload, config.jwtSecret, options)
}

/** 从数据库加载用户，确保角色权限改动后立即生效 */
export function loadAuthUser(userId: number): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.real_name, u.role_id, u.status,
              r.code AS role_code, r.name AS role_name, r.permissions
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?`,
    )
    .get(userId) as
    | {
        id: number
        username: string
        real_name: string
        role_id: number
        status: string
        role_code: string
        role_name: string
        permissions: string
      }
    | undefined

  if (!row || row.status !== 'active') return null

  let permissions: Record<string, string[]> = {}
  try {
    permissions = JSON.parse(row.permissions) as Record<string, string[]>
  } catch {
    console.error('[auth] 权限集解析失败:', row.permissions)
  }

  return {
    id: row.id,
    username: row.username,
    realName: row.real_name,
    roleId: row.role_id,
    roleCode: row.role_code,
    roleName: row.role_name,
    permissions,
  }
}

/**
 * 鉴权中间件：解析 Bearer Token 并把用户挂到 req.user。
 * 每次都回查数据库，保证禁用账号 / 调整权限后无需重新登录即刻生效。
 */
export function authRequired(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    next(AppError.unauthorized('未登录或缺少访问令牌'))
    return
  }

  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as TokenPayload
    const user = loadAuthUser(payload.uid)
    if (!user) {
      next(AppError.unauthorized('账号不存在或已被禁用'))
      return
    }
    req.user = user
    next()
  } catch {
    next(AppError.unauthorized('登录状态已过期，请重新登录'))
  }
}
