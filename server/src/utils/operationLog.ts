import type { Request } from 'express'
import { db } from '../db'

/**
 * 记录操作日志：新增、修改、删除、导出等写操作永久留痕。
 * 采用显式调用而非中间件自动拦截——因为只有业务代码才知道
 * 「这次写操作改的是哪个对象、变更了什么」，自动拦截拿不到这些语义。
 */
export function logOperation(
  req: Request,
  module: string,
  action: string,
  target?: string,
  detail?: string,
): void {
  try {
    db.prepare(
      `INSERT INTO operation_logs (user_id, username, module, action, target, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      req.user?.id ?? null,
      req.user?.username ?? 'anonymous',
      module,
      action,
      target ?? null,
      detail ?? null,
      clientIp(req),
    )
  } catch (err) {
    // 日志失败不能影响主流程
    console.error('[oplog] 写入失败:', err)
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim()
  return req.socket.remoteAddress ?? ''
}
