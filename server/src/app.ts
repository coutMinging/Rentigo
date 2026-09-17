import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import { config } from './config'
import { errorHandler, notFoundHandler } from './middleware/error'
import { renderApiIndex } from './utils/apiIndex'
import { apartmentRouter } from './modules/apartment/router'
import { authRouter } from './modules/auth/router'
import { billRouter } from './modules/bill/router'
import { dashboardRouter } from './modules/dashboard/router'
import { factoryRouter } from './modules/factory/router'
import { leaseRouter } from './modules/lease/router'
import { systemRouter } from './modules/system/router'
import { tenantRouter } from './modules/tenant/router'
import { uploadRouter } from './modules/upload/router'
import { viewingRouter } from './modules/viewing/router'
import { workOrderRouter } from './modules/work_order/router'

/** 前端产物入口文件：存在它才认为产物已构建完成 */
function webIndexFile(): string {
  return path.join(config.webDistDir, 'index.html')
}

/**
 * 是否由后端托管前端产物。
 * 单机部署时开启可以让「一个 Node 进程 = 整个系统」，无需再装 nginx 做静态托管；
 * 前后端分离部署（nginx 托前端）时把 SERVE_WEB 设为 false 即可。
 */
export function isHostingWeb(): boolean {
  return config.serveWeb && fs.existsSync(webIndexFile())
}

/**
 * 创建 Express 应用实例。
 * 拆成函数是为了后续写测试时能直接拿到 app 而不用真的监听端口。
 */
export function createApp() {
  const app = express()

  // 部署在 nginx / 云负载均衡之后时，让 req.ip 取到真实客户端 IP（操作日志会记录它）
  if (config.isProduction) app.set('trust proxy', 1)

  if (config.corsOrigins.length > 0) {
    // 前后端不同域名：只放行白名单来源
    app.use(cors({ origin: config.corsOrigins }))
  } else if (!config.isProduction) {
    // 开发期放开，方便 5173 直接调 3001；生产同源部署不需要 CORS
    app.use(cors())
  }

  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true }))

  // 上传的图片 / 附件通过静态资源暴露
  app.use('/uploads', express.static(config.uploadDir))

  const hostingWeb = isHostingWeb()

  if (hostingWeb) {
    // 带内容哈希的产物可以长缓存，减少重复下载
    app.use(
      '/assets',
      express.static(path.join(config.webDistDir, 'assets'), { maxAge: '1y', immutable: true }),
    )
    // 其余静态文件（favicon、图标等）按文件名取；不自动使用 index.html，交给下面的 SPA 兜底
    app.use(express.static(config.webDistDir, { index: false }))
  } else {
    /**
     * 根路径：后端是纯 API 服务、没有页面，但开发时直接打开这个地址
     * 很容易把 404 误判成"服务挂了"或"登录入口"，所以这里返回一份接口索引。
     */
    app.get('/', (_req, res) => {
      res.type('html').send(renderApiIndex())
    })
  }

  // 健康检查：前端启动时用它确认链路是否打通
  app.get('/api/health', (_req, res) => {
    res.json({
      code: 0,
      message: 'ok',
      data: { ok: true, time: new Date().toISOString() },
    })
  })

  // ===== 业务模块 =====
  app.use('/api/uploads', uploadRouter)
  app.use('/api/auth', authRouter)
  app.use('/api/factories', factoryRouter)
  app.use('/api/apartments', apartmentRouter)
  app.use('/api/tenants', tenantRouter)
  app.use('/api/leases', leaseRouter)
  app.use('/api/bills', billRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/viewings', viewingRouter)
  app.use('/api/work-orders', workOrderRouter)
  app.use('/api/system', systemRouter)

  if (hostingWeb) {
    /**
     * SPA 路由兜底：前端用的是 history 路由，刷新 /leases/12 这类地址时
     * 服务器上并不存在对应文件，必须回落到 index.html 交给前端路由处理。
     * 排除 /api、/uploads、/assets 三类前缀，避免把真实的 404 变成 200。
     */
    app.get(/^\/(?!api\/|uploads\/|assets\/).*/, (_req, res) => {
      res.sendFile(webIndexFile())
    })
  }

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
