import { createApp } from './app'
import { config } from './config'
import { seed } from './db/seed'
import { startScheduler } from './jobs/scheduler'

// 启动顺序：同步表结构 → 写入种子（仅空库） → 启动定时任务 → 监听端口
seed()
startScheduler()

const app = createApp()

app.listen(config.port, () => {
  console.log(`[server] 已启动 → http://localhost:${config.port}`)
  console.log(`[server] 健康检查 → http://localhost:${config.port}/api/health`)
  console.log(`[server] 数据文件 → ${config.dbFile}`)
})
