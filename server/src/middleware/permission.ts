import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../utils/response'

/** 模块权限动作 */
export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'export'

/**
 * 模块级权限校验工厂。
 *
 * 权限集以 JSON 存在 roles.permissions 中，形如：
 *   { "property": ["view","create","edit","delete","export"], "bill": ["view"] }
 *
 * 用工厂而不是完整 RBAC 权限点表，是因为本期只需「模块 × 动作」粒度，
 * 后续若要做按钮级权限，可以平滑替换为权限点表而不影响调用方。
 */
export function requirePermission(module: string, action: PermAction) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) {
      next(AppError.unauthorized())
      return
    }

    // 超级管理员放行一切
    if (user.roleCode === 'admin') {
      next()
      return
    }

    const allowed = user.permissions[module] ?? []
    if (allowed.includes('*') || allowed.includes(action)) {
      next()
      return
    }

    next(AppError.forbidden(`当前角色（${user.roleName}）没有该操作的权限`))
  }
}

/** 在业务代码里直接判断权限（用于返回前端按钮可见性） */
export function hasPermission(user: AuthUserLike | undefined, module: string, action: PermAction): boolean {
  if (!user) return false
  if (user.roleCode === 'admin') return true
  const allowed = user.permissions[module] ?? []
  return allowed.includes('*') || allowed.includes(action)
}

interface AuthUserLike {
  roleCode: string
  permissions: Record<string, string[]>
}
