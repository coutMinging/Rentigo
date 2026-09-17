import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

/** server/ 目录的绝对路径 */
const serverRoot = fileURLToPath(new URL('../../', import.meta.url))

/** 运行时数据目录（数据库文件、上传附件），已被 .gitignore 忽略 */
const dataDir = fileURLToPath(new URL('../../data/', import.meta.url))

const uploadDir = `${dataDir}uploads/`

// 确保运行时目录存在，避免首次启动写库时抛异常
fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(uploadDir, { recursive: true })

export const config = {
  /** 后端监听端口，前端 vite 代理指向这里 */
  port: Number(process.env.PORT ?? 3001),

  /** JWT 签名密钥。生产环境务必通过环境变量覆盖 */
  jwtSecret: process.env.JWT_SECRET ?? 'farental-dev-secret-please-change',
  /** Token 有效期 */
  jwtExpiresIn: '7d',

  serverRoot,
  dataDir,
  uploadDir,
  /** SQLite 数据库文件路径 */
  dbFile: `${dataDir}app.db`,

  /** 租约到期预警提前天数（需求 3.5.3：支持自定义天数） */
  leaseWarnDays: Number(process.env.LEASE_WARN_DAYS ?? 30),

  /** 列表默认分页大小 */
  defaultPageSize: 10,
  maxPageSize: 200,

  /** 上传文件大小上限（10MB） */
  uploadMaxSize: 10 * 1024 * 1024,
}

export type AppConfig = typeof config
