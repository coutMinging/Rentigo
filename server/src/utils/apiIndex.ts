import { config } from '../config'

/**
 * 后端根路径的接口索引页。
 *
 * 后端是纯 API 服务、不是网站，直接访问根路径本来没有内容可返回。
 * 但开发时很容易把它当成"服务挂了"或"登录页"，所以这里返回一份
 * 自包含的 HTML 索引，明确告知服务状态、正确入口与全部可用接口。
 */

interface Endpoint {
  method: string
  path: string
  desc: string
}

interface EndpointGroup {
  name: string
  items: Endpoint[]
}

const GROUPS: EndpointGroup[] = [
  {
    name: '鉴权',
    items: [
      { method: 'POST', path: '/api/auth/login', desc: '登录，返回 JWT 令牌' },
      { method: 'GET', path: '/api/auth/me', desc: '获取当前登录用户与权限' },
      { method: 'POST', path: '/api/auth/logout', desc: '退出登录' },
      { method: 'POST', path: '/api/auth/change-password', desc: '修改密码' },
    ],
  },
  {
    name: '数据看板',
    items: [{ method: 'GET', path: '/api/dashboard', desc: '房源、租约、财务、运营四组指标' }],
  },
  {
    name: '房源管理',
    items: [
      { method: 'GET', path: '/api/factories', desc: '厂房列表（支持筛选与分页）' },
      { method: 'GET', path: '/api/factories/export', desc: '厂房 Excel 导出' },
      { method: 'GET', path: '/api/apartments/tree', desc: '楼栋-楼层-房间三级树' },
      { method: 'GET', path: '/api/apartments/rooms', desc: '公寓房间列表' },
      { method: 'POST', path: '/api/apartments/rooms/batch', desc: '批量录入房间' },
      { method: 'POST', path: '/api/apartments/rooms/batch-update', desc: '批量改租金/状态' },
    ],
  },
  {
    name: '租客管理',
    items: [
      { method: 'GET', path: '/api/tenants', desc: '租客列表（标签自动推导）' },
      { method: 'GET', path: '/api/tenants/:id', desc: '租客详情（关联房源与租约）' },
      { method: 'GET', path: '/api/tenants/export', desc: '租客 Excel 导出' },
    ],
  },
  {
    name: '租约合同',
    items: [
      { method: 'GET', path: '/api/leases', desc: '租约列表' },
      { method: 'POST', path: '/api/leases/preview', desc: '装修抵扣试算（不落库）' },
      { method: 'POST', path: '/api/leases', desc: '新建租约并自动生成账单' },
      { method: 'POST', path: '/api/leases/:id/settlement', desc: '退租结算试算' },
      { method: 'POST', path: '/api/leases/:id/terminate', desc: '确认退租' },
      { method: 'GET', path: '/api/leases/:id/contract', desc: '合同 HTML（可打印导出 PDF）' },
    ],
  },
  {
    name: '财务账单',
    items: [
      { method: 'GET', path: '/api/bills', desc: '账单台账' },
      { method: 'GET', path: '/api/bills/arrears', desc: '欠费明细' },
      { method: 'POST', path: '/api/bills/:id/payments', desc: '登记收款（支持部分收款）' },
      { method: 'POST', path: '/api/bills/:id/items', desc: '追加水电/车位/违约金' },
      { method: 'GET', path: '/api/bills/deposits', desc: '押金台账' },
      { method: 'GET', path: '/api/bills/reports', desc: '业态分离报表' },
    ],
  },
  {
    name: '系统',
    items: [
      { method: 'GET', path: '/api/system/settings', desc: '基础参数' },
      { method: 'GET', path: '/api/system/roles', desc: '角色与权限' },
      { method: 'GET', path: '/api/system/users', desc: '账号管理' },
      { method: 'GET', path: '/api/system/logs', desc: '操作日志' },
      { method: 'GET', path: '/api/system/notifications', desc: '站内消息' },
    ],
  },
]

const METHOD_COLOR: Record<string, string> = {
  GET: '#0066CC',
  POST: '#1D9A4E',
  PUT: '#C77700',
  DELETE: '#D70015',
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 渲染接口索引 HTML，样式与前端保持一致的纯白克制风格 */
export function renderApiIndex(): string {
  const groups = GROUPS.map(
    (group) => `
      <section class="group">
        <h2>${escapeHtml(group.name)}</h2>
        <table>
          <tbody>
            ${group.items
              .map(
                (item) => `<tr>
                  <td class="method"><span style="color:${METHOD_COLOR[item.method] ?? '#6E6E73'}">${item.method}</span></td>
                  <td class="path"><code>${escapeHtml(item.path)}</code></td>
                  <td class="desc">${escapeHtml(item.desc)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>`,
  ).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>API 服务运行中 · 厂房及公寓楼出租管理系统</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px 24px 64px;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
    color: #1D1D1F; background: #FFFFFF;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 880px; margin: 0 auto; }
  .head { display: flex; align-items: center; gap: 14px; }
  .logo { width: 44px; height: 44px; flex-shrink: 0; }
  h1 { font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.02em; }
  .sub { color: #86868B; font-size: 13px; margin-top: 3px; }
  .status {
    display: inline-flex; align-items: center; gap: 7px; margin-top: 26px;
    padding: 7px 14px; border-radius: 999px; background: rgba(29,154,78,0.10);
    color: #1D9A4E; font-size: 13px; font-weight: 500;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #1D9A4E; }
  .notice {
    margin-top: 28px; padding: 20px 22px; border-radius: 16px;
    background: #FBFBFD; border: 1px solid rgba(0,0,0,0.06);
  }
  .notice p { margin: 0; font-size: 13.5px; line-height: 1.9; color: #6E6E73; }
  .notice strong { color: #1D1D1F; font-weight: 600; }
  .notice code {
    background: rgba(0,0,0,0.05); padding: 2px 7px; border-radius: 6px;
    font-size: 12.5px; font-family: ui-monospace, "SF Mono", Consolas, monospace;
  }
  .groups { margin-top: 40px; }
  .group { margin-bottom: 30px; }
  h2 {
    font-size: 12px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase;
    color: #86868B; margin: 0 0 10px; padding-bottom: 9px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 9px 0; font-size: 13.5px; vertical-align: middle; }
  .method { width: 68px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.03em; }
  .path { width: 330px; }
  code {
    font-family: ui-monospace, "SF Mono", Consolas, monospace;
    font-size: 12.5px; color: #1D1D1F;
  }
  .desc { color: #86868B; font-size: 13px; }
  footer {
    margin-top: 44px; padding-top: 20px; border-top: 1px solid rgba(0,0,0,0.06);
    color: #AEAEB2; font-size: 12.5px; line-height: 1.9;
  }
  @media (max-width: 640px) {
    .path { width: auto; } .desc { display: none; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <svg class="logo" viewBox="0 0 48 48" role="img" aria-label="Rentigo">
        <rect width="48" height="48" rx="13.5" fill="#1D1D1F" />
        <g fill="none" stroke="#FFFFFF" stroke-width="4.86" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15.47 12.12V33.07" />
          <path d="M15.47 12.12h7.45a6.48 6.48 0 0 1 0 12.96h-7.45" />
          <path d="M22.92 25.08L32.64 34.8" />
        </g>
      </svg>
      <div>
        <h1>Rentigo · 厂房及公寓楼出租管理系统</h1>
        <div class="sub">Factory &amp; Apartment Rental API</div>
      </div>
    </div>

    <div class="status"><span class="dot"></span>服务运行中 · 端口 ${config.port}</div>

    <div class="notice">
      <p>
        <strong>这里不是登录页面。</strong>本地址是纯后端 API 服务，只响应 <code>/api/</code> 开头的接口，
        直接访问根路径没有页面，属于正常现象（此前返回的 404 就是这个原因，不是服务故障）。
      </p>
      <p style="margin-top:10px">
        要登录系统请访问前端地址：<code>http://localhost:${config.port === 3001 ? '5173' : config.port}</code>
        ，默认账号 <code>admin / 123456</code>。
      </p>
      <p style="margin-top:10px">
        登录接口为 <code>POST /api/auth/login</code>，需要以 POST 方式提交 JSON
        <code>{ "username": "admin", "password": "123456" }</code>，
        用浏览器直接打开该地址会因方法是 GET 而返回 404。
      </p>
    </div>

    <div class="groups">${groups}</div>

    <footer>
      健康检查：<code>GET /api/health</code><br />
      数据文件：<code>${escapeHtml(config.dbFile)}</code><br />
      统一响应格式：<code>{ code, message, data }</code>，<code>code === 0</code> 表示成功
    </footer>
  </div>
</body>
</html>`
}
