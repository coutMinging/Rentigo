import { createApp, isHostingWeb } from './app'
import { assertProductionConfig, config } from './config'
import { seed } from './db/seed'
import { startScheduler } from './jobs/scheduler'

// 生产环境先做配置自检，把「密钥没改」这类问题拦在启动阶段
assertProductionConfig()

// 启动顺序：同步表结构 → 写入种子（仅空库） → 启动定时任务 → 监听端口
seed()
startScheduler()

const app = createApp()

app.listen(config.port, () => {
  console.log(`[server] 已启动 → http://localhost:${config.port}`)
  console.log(`[server] 健康检查 → http://localhost:${config.port}/api/health`)
  console.log(`[server] 数据文件 → ${config.dbFile}`)
  console.log(
    isHostingWeb()
      ? `[server] 已托管前端产物 → ${config.webDistDir}`
      : '[server] 未检测到前端产物（web/dist），当前仅提供 API 服务',
  )
})
