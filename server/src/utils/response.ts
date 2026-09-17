import type { Response } from 'express'

/** 统一响应体结构，前端 axios 拦截器按 code 判断成败 */
export interface ApiResult<T = unknown> {
  code: number
  message: string
  data: T | null
}

/** 分页数据结构 */
export interface PageData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/** 分页查询参数（已归一化） */
export interface PageQuery {
  page: number
  pageSize: number
  offset: number
}

/** 从 query 中解析并归一化分页参数 */
export function parsePageQuery(
  query: Record<string, unknown>,
  defaultPageSize: number,
  maxPageSize: number,
): PageQuery {
  const rawPage = Number(query.page)
  const rawSize = Number(query.pageSize)

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const pageSize =
    Number.isFinite(rawSize) && rawSize > 0
      ? Math.min(Math.floor(rawSize), maxPageSize)
      : defaultPageSize

  return { page, pageSize, offset: (page - 1) * pageSize }
}

/** 成功响应 */
export function ok<T>(res: Response, data: T, message = 'ok'): void {
  res.json({ code: 0, message, data } satisfies ApiResult<T>)
}

/** 分页成功响应 */
export function okPage<T>(res: Response, payload: PageData<T>): void {
  ok(res, payload)
}

/** 业务异常：由错误处理中间件统一捕获并格式化 */
export class AppError extends Error {
  code: number
  status: number

  constructor(message: string, code = 400, status = 200) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }

  static badRequest(message = '请求参数有误') {
    return new AppError(message, 400)
  }

  static unauthorized(message = '登录已失效，请重新登录') {
    return new AppError(message, 401, 401)
  }

  static forbidden(message = '没有操作权限') {
    return new AppError(message, 403, 403)
  }

  static notFound(message = '数据不存在') {
    return new AppError(message, 404, 404)
  }

  static conflict(message = '数据已存在或状态冲突') {
    return new AppError(message, 409)
  }
}
