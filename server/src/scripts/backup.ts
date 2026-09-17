/**
 * SQLite 在线备份脚本
 *
 * 用途：把数据库与上传附件打一份一致性快照，服务运行中也能安全执行。
 * 用法：
 *   npm run backup -w server                  # 备份到 server/data/backups
 *   npx tsx src/scripts/backup.ts /mnt/disk   # 备份到指定目录（推荐另一块盘）
 *
 * 为什么不能直接复制 app.db：
 *   数据库跑在 WAL 模式下，最近的写入可能还在 app.db-wal 里没合并回主库，
 *   单独拷 app.db 会丢掉最新数据。这里用 SQLite 的 VACUUM INTO 生成快照，
 *   它是事务一致的，且不需要停服务。
 */
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from '../config'

/** 保留最近多少份快照，超出后按时间从旧到新清理 */
const KEEP = Number(process.env.BACKUP_KEEP ?? 14)

const targetDir = path.resolve(process.argv[2] ?? path.join(config.dataDir, 'backups'))

if (!fs.existsSync(config.dbFile)) {
  console.error(`[backup] 找不到数据库文件：${config.dbFile}`)
  process.exit(1)
}

fs.mkdirSync(targetDir, { recursive: true })

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const stamp =
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
  `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

// ---------- 1. 数据库快照 ----------
const dbTarget = path.join(targetDir, `app-${stamp}.db`)
const source = new Database(config.dbFile)
try {
  // VACUUM INTO 不支持绑定参数，路径里的单引号需要手工转义
  source.exec(`VACUUM INTO '${dbTarget.replace(/'/g, "''")}'`)
} finally {
  source.close()
}

const sizeMb = (fs.statSync(dbTarget).size / 1024 / 1024).toFixed(2)
console.log(`[backup] 数据库快照 → ${dbTarget}（${sizeMb} MB）`)

// ---------- 2. 上传附件 ----------
const hasUploads =
  fs.existsSync(config.uploadDir) && fs.readdirSync(config.uploadDir).length > 0

if (hasUploads) {
  const uploadTarget = path.join(targetDir, `uploads-${stamp}`)
  fs.cpSync(config.uploadDir, uploadTarget, { recursive: true })
  console.log(`[backup] 附件目录 → ${uploadTarget}`)
} else {
  console.log('[backup] 附件目录为空，跳过')
}

// ---------- 3. 清理旧快照 ----------
// 文件名形如 app-20260917-134301.db，字典序即时间序
const snapshots = fs
  .readdirSync(targetDir)
  .filter((name) => /^app-\d{8}-\d{6}\.db$/.test(name))
  .sort()

const expired = snapshots.slice(0, Math.max(0, snapshots.length - KEEP))

for (const name of expired) {
  fs.rmSync(path.join(targetDir, name), { force: true })
  // 同一时间戳的附件目录一并清掉，避免磁盘只涨不降
  const uploadDir = path.join(targetDir, name.replace(/^app-/, 'uploads-').replace(/\.db$/, ''))
  if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true })
  console.log(`[backup] 清理旧快照 → ${name}`)
}

console.log(`[backup] 完成，当前保留 ${Math.min(snapshots.length, KEEP)} 份，目录：${targetDir}`)
