import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** server/ 目录的绝对路径 */
const serverRoot = fileURLToPath(new URL('../../', import.meta.url))

/**
 * 极简 .env 读取：不引入 dotenv，避免多一个运行时依赖。
 * 只补齐「进程环境里尚不存在」的键，因此 pm2 / systemd / Docker 注入的变量优先级更高。
 */
function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const matched = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!matched) continue

    const [, key, raw] = matched
    if (process.env[key] !== undefined) continue
    // 允许值两侧加引号（便于写含空格或 # 的值）
    process.env[key] = raw.trim().replace(/^(['"])([\s\S]*)\1$/, '$2')
  }
}

// 必须在读取任何 process.env 之前执行
loadEnvFile(path.join(serverRoot, '.env'))

/** 运行时数据目录（数据库文件、上传附件），已被 .gitignore 忽略 */
const dataDir = fileURLToPath(new URL('../../data/', import.meta.url))

const uploadDir = `${dataDir}uploads/`

// 确保运行时目录存在，避免首次启动写库时抛异常
fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(uploadDir, { recursive: true })

const isProduction = process.env.NODE_ENV === 'production'

/** 读取布尔型环境变量；留空或无法识别的值一律回落到 fallback */
function readBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

/** 开发期的默认密钥，仅用于本地调试；生产环境出现它会被启动自检拦下 */
const DEV_JWT_SECRET = 'farental-dev-secret-please-change'

export const config = {
  /** 是否按生产模式运行（决定种子数据、CORS、密钥自检等行为） */
  isProduction,

  /** 后端监听端口，前端 vite 代理指向这里 */
  port: Number(process.env.PORT ?? 3001),

  /** JWT 签名密钥。生产环境务必通过环境变量覆盖 */
  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  /** Token 有效期 */
  jwtExpiresIn: '7d',

  serverRoot,
  dataDir,
  uploadDir,
  /** SQLite 数据库文件路径 */
  dbFile: `${dataDir}app.db`,

  /** 前端构建产物目录（单机部署由后端直接托管，无需再挂 nginx） */
  webDistDir: process.env.WEB_DIST_DIR
    ? path.resolve(process.env.WEB_DIST_DIR)
    : path.resolve(serverRoot, '..', 'web', 'dist'),
  /** 是否托管前端产物；默认自动（存在 web/dist/index.html 就托管） */
  serveWeb: readBool(process.env.SERVE_WEB, true),

  /** 允许跨域的前端来源白名单，逗号分隔；留空时开发放开、生产关闭（同源部署） */
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  /** 是否写入演示种子数据。生产默认关闭，避免真实库被灌入演示业务数据 */
  seedDemoData: readBool(process.env.SEED_DEMO, !isProduction),
  /** 空库初始化时创建的管理员账号（未设 ADMIN_PASSWORD 时随机生成并打印到启动日志） */
  adminUsername: process.env.ADMIN_USERNAME?.trim() || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',

  /** 租约到期预警提前天数（需求 3.5.3：支持自定义天数） */
  leaseWarnDays: Number(process.env.LEASE_WARN_DAYS ?? 30),

  /** 列表默认分页大小 */
  defaultPageSize: 10,
  maxPageSize: 200,

  /** 上传文件大小上限（10MB） */
  uploadMaxSize: 10 * 1024 * 1024,
}

/**
 * 生产环境启动前的自检。
 * 放在函数里而不是模块顶层，是为了让错误出现在启动日志中，而不是模块导入期抛栈。
 */
export function assertProductionConfig(): void {
  if (!config.isProduction) return

  if (config.jwtSecret === DEV_JWT_SECRET || config.jwtSecret.length < 16) {
    throw new Error(
      '生产环境必须配置 JWT_SECRET（长度 ≥ 16），可用 `openssl rand -hex 32` 生成后写入 server/.env',
    )
  }
  if (config.seedDemoData) {
    console.warn('[config] 警告：生产环境开启了 SEED_DEMO，空库将写入演示业务数据')
  }
  if (config.adminPassword && config.adminPassword.length < 8) {
    console.warn('[config] 警告：ADMIN_PASSWORD 过短，建议至少 8 位')
  }
}

export type AppConfig = typeof config
