import type { ZodType } from 'zod'
import { AppError } from './response'

/**
 * 用 zod 校验请求体，失败时把第一条错误信息作为业务提示抛出。
 * 统一在这里做，业务代码里就不需要各写一遍 if 判断。
 */
export function validateBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    const first = result.error.issues[0]
    const path = first.path.join('.')
    throw AppError.badRequest(path ? `${path}: ${first.message}` : first.message)
  }
  return result.data
}

/** 解析并校验路径参数中的数字 id */
export function parseId(raw: unknown, label = 'ID'): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest(`${label} 不合法`)
  }
  return id
}

/** 把空字符串与 undefined 统一归一化为 null */
export function emptyToNull<T extends Record<string, unknown>>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    output[key] = value === '' || value === undefined ? null : value
  }
  return output as T
}

/**
 * 构造 SQL 命名参数对象。
 *
 * 必须显式传列名清单，原因是 zod 会把「未传的可选字段」直接丢弃，
 * 而 better-sqlite3 要求语句里出现的每个命名参数都必须在对象中存在，
 * 否则抛 "Missing named parameter"。这里按列名逐一补齐，把缺失值置为 null。
 */
export function toSqlParams(
  data: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const key of keys) {
    const value = data[key]
    params[key] = value === undefined || value === '' ? null : value
  }
  return params
}
