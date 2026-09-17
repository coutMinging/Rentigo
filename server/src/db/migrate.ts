import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { db } from './index'

/**
 * 幂等建表：schema.sql 里所有语句都是 CREATE ... IF NOT EXISTS，
 * 因此每次启动都执行一遍是安全的，新增表也会自动补上。
 */
export function migrate(): void {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url))
  const sql = fs.readFileSync(schemaPath, 'utf-8')

  db.exec(sql)
  console.log('[db] 表结构已同步')
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
