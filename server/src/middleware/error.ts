import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../utils/response'

/** 404 兜底：未匹配到任何路由 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    code: 404,
    message: `接口不存在: ${req.method} ${req.originalUrl}`,
    data: null,
  })
}

/**
 * 全局错误处理中间件。
 * 放在所有路由之后注册，Express 靠 4 个参数识别它是错误处理中间件。
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 业务异常：按约定的 code 返回
  if (err instanceof AppError) {
    res.status(err.status).json({ code: err.code, message: err.message, data: null })
    return
  }

  // SQLite 约束错误转成可读提示
  const raw = err as { code?: string; message?: string }
  if (typeof raw?.code === 'string' && raw.code.startsWith('SQLITE_CONSTRAINT')) {
    const message = raw.message?.includes('UNIQUE')
      ? '数据已存在，请检查唯一字段'
      : '数据校验未通过，请检查必填项与关联数据'
    res.status(200).json({ code: 409, message, data: null })
    return
  }

  // 兜底：打日志，避免把内部堆栈暴露给前端
  console.error('[server] 未处理异常:', err)
  res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
}

/** 包装 async 路由处理器，让抛出的异常能进入 errorHandler */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
