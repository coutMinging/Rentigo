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

/**
 * 创建 Express 应用实例。
 * 拆成函数是为了后续写测试时能直接拿到 app 而不用真的监听端口。
 */
export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true }))

  // 上传的图片 / 附件通过静态资源暴露
  app.use('/uploads', express.static(config.uploadDir))

  /**
   * 根路径：后端是纯 API 服务、没有页面，但开发时直接打开这个地址
   * 很容易把 404 误判成"服务挂了"或"登录入口"，所以这里返回一份接口索引。
   */
  app.get('/', (_req, res) => {
    res.type('html').send(renderApiIndex())
  })

  // 健康检查：前端启动时用它确认链路是否打通
  app.get('/api/health', (_req, res) => {
    res.json({
      code: 0,
      message: 'ok',
      data: { ok: true, time: new Date().toISOString() },
    })
  })

  // ===== 业务模块 =====
  app.use('/api/auth', authRouter)
  app.use('/api/factories', factoryRouter)
  app.use('/api/apartments', apartmentRouter)
  app.use('/api/tenants', tenantRouter)
  app.use('/api/leases', leaseRouter)
  app.use('/api/bills', billRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/system', systemRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
