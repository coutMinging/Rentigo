import type { BillStatus, FactoryStatus, ApartmentStatus, LeaseStatus, PropertyType, PayCycle, TenantTag } from '../types'

/** 状态标签的文案与配色，全站统一，保证同一种状态在任何页面颜色一致 */

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'processing' | 'purple'

export interface StatusMeta {
  label: string
  tone: Tone
}

export const FACTORY_STATUS: Record<FactoryStatus, StatusMeta> = {
  vacant: { label: '待出租', tone: 'default' },
  rented: { label: '已出租', tone: 'success' },
  disabled: { label: '空置停用', tone: 'warning' },
}

export const APARTMENT_STATUS: Record<ApartmentStatus, StatusMeta> = {
  vacant: { label: '空置', tone: 'default' },
  rented: { label: '已租', tone: 'success' },
  repair: { label: '待维修', tone: 'warning' },
}

export const LEASE_STATUS: Record<LeaseStatus, StatusMeta> = {
  active: { label: '正常履约', tone: 'processing' },
  expiring: { label: '即将到期', tone: 'warning' },
  expired: { label: '已到期', tone: 'default' },
  terminated: { label: '已退租', tone: 'success' },
  breach: { label: '解约欠费', tone: 'danger' },
}

export const BILL_STATUS: Record<BillStatus, StatusMeta> = {
  pending: { label: '待收款', tone: 'processing' },
  paid: { label: '已收款', tone: 'success' },
  overdue: { label: '逾期欠费', tone: 'danger' },
  partial: { label: '部分收款', tone: 'purple' },
}

export const TENANT_TAG: Record<TenantTag, StatusMeta> = {
  intent: { label: '意向租客', tone: 'processing' },
  signed: { label: '已签约租客', tone: 'success' },
  arrears: { label: '欠费租客', tone: 'danger' },
  renew: { label: '待续租租客', tone: 'warning' },
}

export const PROPERTY_TYPE: Record<PropertyType, string> = {
  factory: '厂房',
  apartment: '公寓',
}

export const PAY_CYCLE: Record<PayCycle, string> = {
  month: '月付',
  quarter: '季付',
  year: '年付',
}

export const PAY_METHOD = {
  transfer: '银行转账',
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  check: '支票',
} as const

export const BILL_ITEM_TYPE = {
  water: '水费',
  electric: '电费',
  parking: '车位费',
  penalty: '违约金',
  other: '其他费用',
} as const

export const DEPOSIT_TYPE = {
  collect: '收取',
  refund: '退还',
  deduct: '抵扣',
} as const

export const FIRE_RATINGS = ['甲类', '乙类', '丙一类', '丙二类', '丁类', '戊类']

export const FLOOR_TYPES = ['金刚砂耐磨地坪', '环氧地坪', '混凝土地坪', '钢纤维混凝土地坪', '防静电地坪']

export const LAYOUTS = ['一室一卫', '一室一厅一卫', '两室一厅一卫', '两室两厅一卫', '三室一厅一卫']

export const ORIENTATIONS = ['南', '东南', '西南', '东', '西', '北']

/** 模块中文名，权限配置与操作日志共用 */
export const MODULE_LABEL: Record<string, string> = {
  dashboard: '数据看板',
  property: '房源管理',
  tenant: '租客管理',
  lease: '租约合同',
  bill: '财务账单',
  workOrder: '报修工单',
  viewing: '看房预约',
  system: '系统设置',
}

export const PERMISSION_ACTIONS: Array<{ key: string; label: string }> = [
  { key: 'view', label: '查看' },
  { key: 'create', label: '新增' },
  { key: 'edit', label: '编辑' },
  { key: 'delete', label: '删除' },
  { key: 'export', label: '导出' },
]

export const OPERATION_ACTION: Record<string, string> = {
  login: '登录',
  logout: '退出',
  'change-password': '修改密码',
  create: '新增',
  edit: '修改',
  delete: '删除',
  export: '导出',
}

/** 状态色点，用于紧凑列表 */
export const TONE_COLOR: Record<Tone, string> = {
  default: '#AEAEB2',
  success: '#1D9A4E',
  warning: '#C77700',
  danger: '#D70015',
  processing: '#0066CC',
  purple: '#7C5CFF',
}

/** 图表配色：克制的低饱和色板 */
export const CHART_COLORS = ['#1D1D1F', '#0066CC', '#7C5CFF', '#1D9A4E', '#C77700', '#D70015']
