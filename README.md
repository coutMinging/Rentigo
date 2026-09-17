# 厂房及公寓楼出租管理系统

面向管理员的 PC 端后台管理系统，覆盖厂房与公寓双业态租赁全流程。

核心解决三个问题：**装修费抵扣租金核算混乱**、**租约到期遗忘**、**财务台账靠人工 Excel**。

---

## 功能范围

### 本期已交付（核心 5 模块）

| 模块 | 主要能力 |
| --- | --- |
| **数据统计看板** | 出租率、本月应收/实收、累计装修抵扣、到期与逾期预警、近 12 个月收支趋势、业态收入分布 |
| **房源管理** | 厂房 15+ 专属参数（层高、承重、变压器、行车、消防等级、可否环评…）；公寓「楼栋 → 楼层 → 房间」三级管理，支持批量录入、批量改租金/状态 |
| **租客管理** | 个人/企业两类档案；标签由租约与账单自动推导（已签约/待续租/欠费），无需人工维护；自动关联名下房源与租约历史 |
| **租约合同** | 多房源关联；**装修费抵扣租金**实时试算与自动核算；按缴费周期自动生成全部期次账单；到期预警；退租结算（押金抵扣、水电结算、应退应补）；合同在线预览与打印导出 PDF |
| **财务账单** | 账单台账（逾期整行高亮）、追加水电/车位/违约金、收款登记（支持部分收款）、欠费明细、押金台账、业态分离报表、Excel 导出 |

### 下阶段预留（菜单已就绪，数据表与只读接口已建好）

- 看房预约管理（`viewings` 表）
- 报修工单管理（`work_orders` 表）

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite 5 + Ant Design 5 + Tailwind CSS 3.4 |
| 图表 | Recharts |
| 路由 / 状态 | React Router 6 / Zustand 5 |
| HTTP | axios（统一拦截器、Token 注入、导出下载） |
| 后端 | Node.js + Express 4 + TypeScript（tsx 直接运行，无需编译） |
| 数据库 | SQLite + better-sqlite3（WAL 模式，单文件零部署） |
| 鉴权 | jsonwebtoken + bcryptjs |
| Excel | exceljs |
| 工程化 | npm workspaces + concurrently |

---

## 快速开始

### 环境要求

- Node.js ≥ 18（推荐 20 / 22 / 24）
- npm ≥ 9
- **无需安装任何数据库服务** —— SQLite 是嵌入式数据库，由 npm 包直接读写本地文件

### 启动

```bash
# 1. 安装依赖（根目录执行一次，workspaces 会自动装好前后端）
npm install

# 2. 一条命令同时启动前后端
npm run dev
```

启动后：

- 前端：http://localhost:5173
- 后端：http://localhost:3001
- 健康检查：http://localhost:3001/api/health

首次启动会自动建表并写入演示数据（6 处厂房、24 间公寓、11 位租客、8 份租约、122 期账单），无需手动初始化。

### 演示账号

| 账号 | 密码 | 角色 | 权限范围 |
| --- | --- | --- | --- |
| `admin` | `123456` | 超级管理员 | 全部模块 |
| `finance` | `123456` | 财务人员 | 仅查看房源/租客/租约，可操作账单与报表 |
| `ops` | `123456` | 物业运维人员 | 房源查看与编辑、看房与报修工单 |

> 不同角色登录后可见菜单与按钮不同，可在登录页点击账号名自动填充验证。

### 其他命令

```bash
npm run dev:web       # 只启动前端
npm run dev:server    # 只启动后端
npm run build         # 构建前端产物到 web/dist
npm run seed          # 手动写入种子数据（仅空库时生效）
```

### 重置演示数据

数据库文件已被 `.gitignore` 忽略，删除后重启即可重建：

```bash
# Windows PowerShell
Remove-Item server/data/app.db* -Force
npm run dev:server
```

---

## 目录结构

```
.
├── package.json                  # workspaces 与一键启动脚本
├── server/                       # 后端
│   ├── data/                     # 运行时目录（app.db、uploads/），已忽略
│   └── src/
│       ├── index.ts              # 入口：建表 → 种子 → 定时任务 → 监听
│       ├── app.ts                # Express 实例与路由挂载
│       ├── config/               # 端口、JWT、路径、预警天数等配置
│       ├── db/                   # schema.sql / 幂等迁移 / 种子数据
│       ├── middleware/           # 鉴权、权限、统一错误处理、文件上传
│       ├── jobs/scheduler.ts     # 逾期与到期状态流转、站内消息生成
│       ├── modules/              # 业务模块（auth/factory/apartment/tenant/lease/bill/dashboard/system）
│       └── utils/                # billing 核算核心、excel 导出、contract 合同渲染等
└── web/                          # 前端
    ├── vite.config.ts            # @ 别名 + /api、/uploads 代理
    └── src/
        ├── theme.ts              # ⭐ antd 主题 Token（纯白质感，视觉调整只需改这里）
        ├── index.css             # Tailwind 指令与全局微调
        ├── api/                  # axios 封装 + 各模块接口
        ├── components/           # PageCard / StatusTag / KpiCard / ChartCard 等
        ├── layouts/              # 侧边菜单 + 毛玻璃顶栏 + 消息中心
        ├── pages/                # 各模块页面
        ├── store/                # 鉴权状态（含权限判断 can()）
        ├── hooks/                # useTableQuery / useOptions / usePermission
        └── utils/                # 格式化、状态字典、类名合并
```

---

## 关键设计说明

### 装修费抵扣租金（本系统核心）

核算逻辑集中在 `server/src/utils/billing.ts` 的 `buildBillPlan()`，是**全系统唯一真源**，被三处复用：租约试算预览、账单批量生成、报表统计。

规则：

```
每期租金   = Σ(关联房源月租金) × 当期折合月数
每期物业费 = 月物业费 × 当期折合月数
每期抵扣   = 期次 ≤ 抵扣期数 ? min(每期抵扣额, 装修总额剩余未抵扣额) : 0
当期应付   = 租金 + 物业费 − 当期抵扣
```

要点：

- 抵扣**只冲减租金**，物业费照常收取；累计抵扣不超过装修总金额
- 折合月数按自然月逐段累计，不足整月按当月天数折算；租期结束日**含当天**（因此 12 个月的租期恰好等于 12 个月租金）
- 金额统一 `round2` 处理，规避浮点误差累积

### 账单落库而非实时计算

租约创建时按缴费周期一次性生成全部期次账单并落库。原因是收款流水、部分收款、逾期状态与统计都需要挂在具体账单记录上，实时计算无法承载流水归属与对账。

### 权限模型

角色权限以 JSON 存在 `roles.permissions`，形如 `{"bill":["view","create","export"]}`：

- 后端 `requirePermission(module, action)` 中间件拦截，越权返回 403
- 前端 `usePermission()` 控制按钮与菜单可见性
- 每次请求都回查数据库，**调整权限或禁用账号后无需重新登录即刻生效**

### 状态自动流转

`server/src/jobs/scheduler.ts` 在服务启动时执行一次，之后每 30 分钟一次：

- 过了应交日期且未收款的账单 → 逾期欠费
- 租约按结束日期与可配置预警天数 → 即将到期 / 已到期
- 生成站内消息（按天去重，避免重复刷屏）

预警天数可在「系统设置 → 基础参数」调整。

### 合同 PDF

服务端渲染合同正文 HTML，前端用 iframe 承载并由浏览器打印导出 PDF。这样中文渲染天然正确、零字体依赖，也满足「线下打印」要求。后续接入电子签章时替换 `utils/contract.ts` 即可。

### 视觉风格

纯白质感风格：白色画布 + 发丝级分隔线 + 极轻阴影 + 大留白，主按钮近黑、链接用苹果蓝。

**所有视觉参数集中在 `web/src/theme.ts`**，调整观感只需改这一个文件，无需改动任何组件代码。

---

## 接口约定

- 统一响应体：`{ code, message, data }`，`code === 0` 表示成功
- 业务异常也返回 HTTP 200（携带非 0 的 code），鉴权失败返回 401/403，便于前端拦截器统一处理
- 列表接口统一支持 `page` / `pageSize`，返回 `{ list, total, page, pageSize }`
- 字段命名与数据库列一致，统一使用 `snake_case`

主要接口分组：

```
POST   /api/auth/login              登录
GET    /api/dashboard               看板聚合数据
GET    /api/factories               厂房列表（含筛选与导出）
GET    /api/apartments/tree         公寓楼栋-楼层-房间树
POST   /api/apartments/rooms/batch  批量录入房间
GET    /api/tenants/:id             租客详情（含关联房源与租约）
POST   /api/leases/preview          装修抵扣试算（不落库）
POST   /api/leases                  新建租约（自动生成账单）
POST   /api/leases/:id/settlement   退租结算试算
GET    /api/leases/:id/contract     合同 HTML
GET    /api/bills                   账单台账
POST   /api/bills/:id/payments      登记收款（支持部分收款）
GET    /api/bills/reports           业态分离报表
GET    /api/system/logs             操作日志
```

---

## 已知限制与后续规划

1. **图片/附件上传**：`multer` 与上传接口已就绪，页面暂未接入上传控件，房源图片与租客证件目前为空。
2. **看房预约与报修工单**：数据表与只读接口已建好，界面为占位框架页，可在现有骨架上直接开发。
3. **短信与电子签章**：系统设置中已预留开关，接入第三方时补充 `notifications` 的发送适配层即可。
4. **单机部署**：SQLite 与内存定时任务适合单机后台。若多实例部署，需将 SQLite 换成 PostgreSQL 并把定时任务外置。

---

## 常见问题

| 现象 | 原因与解决 |
| --- | --- |
| `npm run dev` 报找不到 `concurrently` | 没在根目录执行 `npm install` |
| 页面显示接口失败 | 后端未启动，确认 3001 端口有服务在监听 |
| 端口被占用 | `Get-NetTCPConnection -LocalPort 3001,5173 -State Listen \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` |
| 想恢复初始演示数据 | 删除 `server/data/app.db*` 后重启后端 |
| 中文字段或表名显示异常 | 与业务无关，属于终端编码问题，不影响数据 |
