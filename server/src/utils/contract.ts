import type { BillPlanItem } from './billing'

/**
 * 合同模板渲染：把租约数据代入模板生成可直接打印的 HTML。
 *
 * 采用「服务端渲染 HTML + 浏览器打印导出 PDF」而非服务端生成 PDF，
 * 原因是服务端生成中文 PDF 需要内置 CJK 字体（体积大、Windows 字体授权复杂），
 * 浏览器打印零依赖且中文渲染天然正确，也满足需求里的「线下打印」要求。
 */

export interface ContractContext {
  lease_no: string
  tenant_name: string
  tenant_contact: string
  tenant_phone: string
  tenant_id_card: string
  tenant_type: string
  property_names: string[]
  property_type: 'factory' | 'apartment'
  start_date: string
  end_date: string
  sign_date: string
  pay_cycle_label: string
  monthly_rent: number
  monthly_property_fee: number
  deposit_amount: number
  decoration_total: number
  decoration_periods: number
  decoration_per_month: number
  extra_clause: string
  plan: BillPlanItem[]
}

export type ContractKind = 'factory' | 'apartment' | 'decoration'

function money(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TITLES: Record<ContractKind, string> = {
  factory: '厂房租赁合同',
  apartment: '公寓租赁合同',
  decoration: '装修费抵扣租金补充协议',
}

function esc(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 主体条款：厂房与公寓略有差异 */
function mainClauses(ctx: ContractContext, kind: ContractKind): string {
  const subject = kind === 'factory' ? '厂房' : '公寓'
  const itemsList = ctx.property_names.map((n, i) => `<li>${esc(n)}</li>`).join('')

  return `
  <h2>第一条 租赁标的</h2>
  <p>甲方将下列${subject}出租给乙方使用：</p>
  <ol>${itemsList}</ol>

  <h2>第二条 租赁期限</h2>
  <p>租赁期限自 <b>${ctx.start_date}</b> 起至 <b>${ctx.end_date}</b> 止。</p>

  <h2>第三条 租金与费用</h2>
  <p>月租金合计人民币 <b>${money(ctx.monthly_rent)}</b> 元，月物业费合计人民币 <b>${money(
    ctx.monthly_property_fee,
  )}</b> 元。缴费周期为<b>${ctx.pay_cycle_label}</b>。</p>
  ${
    kind === 'factory'
      ? '<p>厂房水电费按实际用量单独计量，按园区公布单价据实结算。</p>'
      : '<p>公寓水电网费用按实际用量据实结算，民用与商用水电单价以账单载明为准。</p>'
  }

  <h2>第四条 押金</h2>
  <p>乙方于签订本合同时向甲方支付押金人民币 <b>${money(ctx.deposit_amount)}</b> 元。租赁期满且乙方无违约行为、结清全部费用后，甲方于 15 个工作日内无息退还。</p>

  <h2>第五条 双方权利与义务</h2>
  <p>甲方应保证租赁标的权属清晰、可正常使用；乙方应按约定用途使用租赁标的，不得擅自改变结构或转租，并按时足额缴纳租金及各项费用。</p>

  <h2>第六条 合同解除与违约</h2>
  <p>任何一方违反本合同约定，守约方有权要求违约方承担相应违约责任。乙方逾期支付租金超过 30 日的，甲方有权解除合同并追究违约责任。</p>

  ${
    ctx.extra_clause
      ? `<h2>第七条 附加条款</h2><p>${esc(ctx.extra_clause).replace(/\n/g, '</p><p>')}</p>`
      : ''
  }
  `
}

/** 装修费抵扣专项条款 */
function decorationClauses(ctx: ContractContext): string {
  const rows = ctx.plan
    .slice(0, Math.max(ctx.decoration_periods, 1))
    .map(
      (p) =>
        `<tr><td>第 ${p.periodIndex} 期</td><td>${p.periodStart} ~ ${p.periodEnd}</td><td>${money(
          p.rentAmount,
        )}</td><td>${money(p.decorationDeduction)}</td><td>${money(p.payableAmount)}</td></tr>`,
    )
    .join('')

  return `
  <h2>第一条 抵扣事由</h2>
  <p>乙方承租期间对租赁标的进行装修改造，经双方确认装修总投入为人民币 <b>${money(
    ctx.decoration_total,
  )}</b> 元。双方同意以该笔装修投入抵扣相应期次的租金。</p>

  <h2>第二条 抵扣方式</h2>
  <p>装修费分 <b>${ctx.decoration_periods}</b> 期抵扣，每期抵扣人民币 <b>${money(
    ctx.decoration_per_month,
  )}</b> 元，抵扣总额不超过装修总投入金额。抵扣期次结束后，乙方按原标准全额支付租金。</p>

  <h2>第三条 抵扣明细</h2>
  <table>
    <thead><tr><th>期次</th><th>账期区间</th><th>当期租金(元)</th><th>装修抵扣(元)</th><th>实付租金(元)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <h2>第四条 其他约定</h2>
  <p>装修施工须符合消防与安全管理规定，不得破坏建筑主体结构。本合同为 ${esc(
    ctx.lease_no,
  )} 号租赁合同的补充协议，与原合同具有同等法律效力；未尽事宜以原合同约定为准。</p>
  `
}

/** 生成完整可打印的 HTML 文档 */
export function renderContract(kind: ContractKind, ctx: ContractContext): string {
  const isDecoration = kind === 'decoration'
  const title = TITLES[kind]

  const body = isDecoration ? decorationClauses(ctx) : mainClauses(ctx, kind)

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${title} - ${esc(ctx.lease_no)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "PingFang SC", "Microsoft YaHei", "SimSun", serif;
    color: #1f2437; line-height: 1.9; max-width: 820px;
    margin: 0 auto; padding: 48px 56px; background: #fff;
  }
  h1 { text-align: center; font-size: 24px; letter-spacing: 0.2em; margin-bottom: 8px; }
  .meta { text-align: center; color: #8a91a3; font-size: 12px; margin-bottom: 36px; }
  h2 { font-size: 15px; margin: 26px 0 8px; }
  p { font-size: 14px; margin: 6px 0; text-align: justify; }
  ol { font-size: 14px; padding-left: 22px; }
  b { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
  th, td { border: 1px solid #d9dee8; padding: 7px 10px; text-align: center; }
  th { background: #f5f7fb; font-weight: 600; }
  .parties { display: flex; gap: 40px; font-size: 14px; margin: 18px 0 8px; }
  .parties > div { flex: 1; }
  .sign { display: flex; gap: 40px; margin-top: 56px; font-size: 14px; }
  .sign > div { flex: 1; }
  .sign .line { border-bottom: 1px solid #1f2437; height: 34px; margin-bottom: 8px; }
  .tip { color: #98a0b3; font-size: 12px; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">合同编号：${esc(ctx.lease_no)}　·　签订日期：${ctx.sign_date}</p>

  <div class="parties">
    <div>
      <p><b>出租方（甲方）</b>：厂房及公寓楼出租管理中心</p>
      <p>联系电话：0571-8888 0000</p>
    </div>
    <div>
      <p><b>承租方（乙方）</b>：${esc(ctx.tenant_name)}</p>
      <p>${ctx.tenant_type === 'company' ? '联系人' : '本人'}：${esc(
        ctx.tenant_contact || ctx.tenant_name,
      )}　电话：${esc(ctx.tenant_phone)}</p>
    </div>
  </div>

  ${body}

  <div class="sign">
    <div>
      <div class="line"></div>
      <p>甲方（盖章）：</p>
      <p class="tip">日期：　　年　　月　　日</p>
    </div>
    <div>
      <div class="line"></div>
      <p>乙方（签字/盖章）：</p>
      <p class="tip">日期：　　年　　月　　日</p>
    </div>
  </div>
</body>
</html>`
}
