import Database from 'better-sqlite3'
import { config } from '../config'

/**
 * SQLite 连接单例。
 * WAL 模式提升读写并发；外键约束默认关闭，需要显式打开。
 */
export const db = new Database(config.dbFile)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

/** 查询辅助：返回单行或 undefined */
export function getOne<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined
}

/** 查询辅助：返回多行 */
export function getAll<T = unknown>(sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[]
}

/** 统计辅助：返回单个数值（COUNT/SUM 等） */
export function getScalar(sql: string, params: unknown[] = []): number {
  const row = db.prepare(sql).get(...(params as never[])) as Record<string, unknown> | undefined
  if (!row) return 0
  const first = Object.values(row)[0]
  return typeof first === 'number' ? first : Number(first ?? 0)
}

/** 执行写入语句，返回 lastInsertRowid */
export function run(sql: string, params: unknown[] = []): number {
  const info = db.prepare(sql).run(...(params as never[]))
  return Number(info.lastInsertRowid)
}

/** 把 JSON 字符串安全解析为数组 */
export function parseJsonArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    console.error('[db] JSON 解析失败:', raw)
    return []
  }
}

/** 把布尔值转成 SQLite 的 0/1 */
export function toBit(value: unknown): number {
  return value === true || value === 1 || value === '1' ? 1 : 0
}
