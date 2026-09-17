import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { db } from './index'

/**
 * 幂等建表：schema.sql 里所有语句都是 CREATE ... IF NOT EXISTS，
 * 因此每次启动都执行一遍是安全的，新增表也会自动补上。
 * 但已存在的表不会因 schema 变更而补列，故建表后再做一次幂等补列。
 */
export function migrate(): void {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url))
  const sql = fs.readFileSync(schemaPath, 'utf-8')

  db.exec(sql)
  ensureColumns()
  console.log('[db] 表结构已同步')
}

/**
 * 幂等补列：SQLite 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，
 * 因此先用 PRAGMA table_info 判断列是否存在，缺列才补，保证重复启动安全。
 * 注意：ADD COLUMN 的默认值不允许是括号表达式，故旧库补出的 updated_at 为可空列，
 * 由业务写入时显式赋值为本地时间。
 */
function ensureColumns(): void {
  const additions: Array<{ table: string; column: string; ddl: string }> = [
    { table: 'viewings', column: 'tenant_id', ddl: 'tenant_id INTEGER' },
    { table: 'viewings', column: 'lease_id', ddl: 'lease_id INTEGER' },
    { table: 'viewings', column: 'updated_at', ddl: 'updated_at TEXT' },
  ]

  for (const { table, column, ddl } of additions) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    // 表尚未建立时跳过（schema.sql 已负责建表）
    if (columns.length === 0) continue
    if (columns.some((item) => item.name === column)) continue

    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
    console.log(`[db] 已补充字段 ${table}.${column}`)
  }
}

/** 判断数据库是否为空（用于决定是否需要写入种子数据） */
export function isEmptyDatabase(): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { c: number }

  if (row.c === 0) return true

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }
  return userCount.c === 0
}
