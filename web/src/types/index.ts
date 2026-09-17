/** 后端统一响应体 */
export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

/** 分页结构 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/** 字段命名与后端保持一致（snake_case），避免来回映射引入错误 */

// ==================== 鉴权 ====================

export interface AuthUser {
  id: number
  username: string
  realName: string
  roleId: number
  roleCode: string
  roleName: string
  permissions: Record<string, string[]>
}

// ==================== 房源 ====================

export type FactoryStatus = 'vacant' | 'rented' | 'disabled'
export type ApartmentStatus = 'vacant' | 'rented' | 'repair'

export interface Factory {
  id: number
  code: string
  name: string
  address: string
  total_area: number
  divisible_area: number
  floor_height: number | null
  floor_load: number | null
  floor_type: string | null
  transformer_capacity: number | null
  has_crane: number
  crane_tonnage: number | null
  fire_rating: string | null
  env_approved: number
  independent_yard: number
  dorm_area: number | null
  yard_area: number | null
  truck_access: string | null
  forbidden_industry: string | null
  rent_price: number
  property_fee: number
  water_price: number | null
  electric_price: number | null
  min_lease_months: number
  allow_sublet: number
  status: FactoryStatus
  images: string[]
  attachments: string[]
  remark: string | null
  created_at: string
  active_lease_count?: number
}

export interface Building {
  id: number
  name: string
  floors: number
  address: string | null
  has_elevator: number
  remark: string | null
  room_count: number
  rented_count: number
  vacant_count: number
  repair_count: number
}

export interface Apartment {
  id: number
  code: string
  building_id: number
  building_name: string
  floor: number
  room_no: string
  layout: string | null
  area: number
  orientation: string | null
  has_elevator: number
  furniture: string | null
  allow_pet: number
  occupancy_limit: number | null
  monthly_rent: number
  deposit_amount: number
  property_fee: number
  water_price: number | null
  electric_price: number | null
  utility_type: 'civil' | 'commercial'
  status: ApartmentStatus
  images: string[]
  remark: string | null
}

export interface ApartmentTreeNode extends Building {
  children: Array<{ floor: number; label: string; rooms: Apartment[] }>
}

// ==================== 租客 ====================

export type TenantTag = 'intent' | 'signed' | 'arrears' | 'renew'

export interface Tenant {
  id: number
  type: 'person' | 'company'
  name: string
  contact_name: string | null
  phone: string
  id_card: string | null
  id_card_file: string | null
  license_file: string | null
  tags: TenantTag[]
  manual_tags: TenantTag[]
  address: string | null
  remark: string | null
  created_at: string
  active_lease_count?: number
  monthly_rent?: number
  owed_amount?: number
}

export interface TenantDetail extends Tenant {
  active_leases: LeaseBrief[]
  history_leases: LeaseBrief[]
  properties: Array<{
    property_type: PropertyType
    property_id: number
    property_name: string
    monthly_rent: number
    lease_no: string
    lease_status: LeaseStatus
  }>
  recent_bills: BillBrief[]
  unpaid_bill_count: number
}

// ==================== 租约 ====================

export type PropertyType = 'factory' | 'apartment'
export type PayCycle = 'month' | 'quarter' | 'year'
export type LeaseStatus = 'active' | 'expiring' | 'expired' | 'terminated' | 'breach'

export interface LeaseItem {
  id: number
  lease_id: number
  property_type: PropertyType
  property_id: number
  property_name: string
  monthly_rent: number
  monthly_property_fee: number
}

export interface Lease {
  id: number
  lease_no: string
  tenant_id: number
  tenant_name: string
  tenant_phone: string
  property_type: PropertyType
  start_date: string
  end_date: string
  pay_cycle: PayCycle
  pay_cycle_label: string
  monthly_rent: number
  monthly_property_fee: number
  deposit_amount: number
  decoration_total: number
  decoration_periods: number
  decoration_per_month: number
  decoration_deducted: number
  extra_clause: string | null
  status: LeaseStatus
  status_label: string
  sign_date: string | null
  terminate_date: string | null
  terminate_reason: string | null
  remark: string | null
  property_names: string
  bill_count: number
  owed_amount: number
}

/** 列表页用的精简结构 */
export interface LeaseBrief {
  id: number
  lease_no: string
  property_type: PropertyType
  start_date: string
  end_date: string
  pay_cycle: PayCycle
  monthly_rent: number
  deposit_amount: number
  decoration_total: number
  decoration_deducted: number
  status: LeaseStatus
}

export interface LeaseDetail {
  lease: Lease & { tenant_type: string; tenant_id_card: string | null; tenant_contact: string | null }
  items: LeaseItem[]
  bills: Bill[]
  payments: Payment[]
  deposits: DepositRecord[]
  decoration_plan: Array<{
    period_index: number
    period_start: string
    period_end: string
    due_date: string
    rent_amount: number
    property_fee: number
    decoration_deduction: number
    payable_amount: number
  }>
  summary: {
    payable_total: number
    paid_total: number
    owed_total: number
    bill_count: number
  }
}

// ==================== 账单 ====================

export type BillStatus = 'pending' | 'paid' | 'overdue' | 'partial'

export interface Bill {
  id: number
  bill_no: string
  lease_id: number
  lease_no?: string
  tenant_id: number
  tenant_name?: string
  tenant_phone?: string
  property_type: PropertyType
  property_names?: string
  period_index: number
  period_start: string
  period_end: string
  due_date: string
  rent_amount: number
  property_fee: number
  other_amount: number
  decoration_deduction: number
  payable_amount: number
  paid_amount: number
  outstanding: number
  is_overdue: boolean
  status: BillStatus
  status_label: string
  payment_count?: number
  overdue_days?: number
}

export interface BillItem {
  id: number
  bill_id: number
  type: 'rent' | 'property' | 'water' | 'electric' | 'parking' | 'penalty' | 'deduction' | 'other'
  type_label: string
  name: string
  amount: number
  remark: string | null
}

export interface Payment {
  id: number
  bill_id: number
  bill_no?: string
  lease_id: number
  lease_no?: string
  tenant_id: number
  tenant_name?: string
  property_type?: PropertyType
  amount: number
  pay_date: string
  method: string
  method_label?: string
  operator: string | null
  remark: string | null
}

export interface DepositRecord {
  id: number
  lease_id: number
  lease_no?: string
  tenant_id: number
  tenant_name?: string
  type: 'collect' | 'refund' | 'deduct'
  type_label?: string
  amount: number
  happen_date: string
  remark: string | null
  operator: string | null
}

export interface BillBrief {
  id: number
  bill_no: string
  period_start: string
  period_end: string
  due_date: string
  payable_amount: number
  paid_amount: number
  status: BillStatus
  property_type: PropertyType
}

// ==================== 试算与结算 ====================

export interface BillPlanItem {
  periodIndex: number
  periodStart: string
  periodEnd: string
  dueDate: string
  rentAmount: number
  propertyFee: number
  decorationDeduction: number
  payableAmount: number
}

export interface PlanPreview {
  items: Array<{ property_name: string; monthly_rent: number; monthly_property_fee: number }>
  monthlyRent: number
  monthlyPropertyFee: number
  decorationPerMonth: number
  plan: BillPlanItem[]
  summary: {
    periodCount: number
    totalRent: number
    totalPropertyFee: number
    totalDecorationDeduction: number
    totalPayable: number
    decorationRemainder: number
  }
}

export interface SettlementResult {
  lease_id: number
  lease_no: string
  tenant_name: string
  property_names: string[]
  terminate_date: string
  deposit_amount: number
  decoration_total: number
  decoration_deducted: number
  decoration_remainder: number
  unpaid_bills: Array<{ bill_no: string; due_date: string; outstanding: number; status: string }>
  unpaid_total: number
  water_fee: number
  electric_fee: number
  other_fee: number
  total_deduction: number
  refund_amount: number
  payable_amount: number
}

// ==================== 看板 ====================

export interface DashboardData {
  property: {
    factory: { total: number; rented: number; vacant: number; disabled: number; rate: number }
    apartment: { total: number; rented: number; vacant: number; repair: number; rate: number }
    overall_rate: number
  }
  lease: { active: number; expiring: number; expired: number; breach: number; total: number }
  finance: {
    month_payable: number
    month_paid: number
    month_deduction: number
    total_deduction: number
    arrears_amount: number
    arrears_count: number
  }
  operation: { viewings_this_month: number; signed_this_month: number; work_orders_open: number }
  trend: Array<{ bucket: string; payable: number; paid: number }>
  by_type: Array<{ property_type: PropertyType; type_label: string; payable: number; paid: number }>
  warnings: {
    expiring_leases: Array<{
      id: number
      lease_no: string
      end_date: string
      property_type: PropertyType
      monthly_rent: number
      tenant_name: string
      tenant_phone: string
      days_left: number
    }>
    overdue_bills: Array<{
      id: number
      bill_no: string
      due_date: string
      property_type: PropertyType
      payable_amount: number
      paid_amount: number
      outstanding: number
      tenant_name: string
      overdue_days: number
      status: BillStatus
    }>
  }
  announcements: Array<{
    id: number
    title: string
    category: string
    is_top: number
    publisher: string | null
    created_at: string
  }>
  warn_days: number
  today: string
}

// ==================== 财务报表 ====================

export interface ReportSeriesItem {
  bucket: string
  factory_payable: number
  factory_paid: number
  factory_deduction: number
  apartment_payable: number
  apartment_paid: number
  apartment_deduction: number
  payable: number
  paid: number
  deduction: number
  other: number
  outstanding: number
}

export interface ReportData {
  granularity: 'month' | 'year'
  start_date: string
  end_date: string
  series: ReportSeriesItem[]
  total: Record<string, number>
}

// ==================== 系统 ====================

export interface Setting {
  key: string
  value: string
  label: string | null
  updated_at: string
}

export interface Role {
  id: number
  name: string
  code: string
  permissions: Record<string, string[]>
  is_preset: number
  remark: string | null
  user_count?: number
}

export interface SysUser {
  id: number
  username: string
  real_name: string
  phone: string | null
  role_id: number
  role_name: string
  role_code: string
  status: 'active' | 'disabled'
  last_login_at: string | null
  created_at: string
}

export interface OperationLog {
  id: number
  user_id: number | null
  username: string | null
  module: string
  action: string
  target: string | null
  detail: string | null
  ip: string | null
  created_at: string
}

export interface AppNotification {
  id: number
  type: string
  title: string
  content: string
  level: 'info' | 'warning' | 'danger'
  related_id: number | null
  is_read: number
  created_at: string
}

export interface Announcement {
  id: number
  title: string
  content: string
  category: string
  is_top: number
  publisher: string | null
  created_at: string
}

// ==================== 看房预约 ====================

export type ViewingStatus = 'pending' | 'appointed' | 'viewed' | 'no_intent' | 'signed'

export interface Viewing {
  id: number
  /** 可选关联的租客档案 id，手工录入时为 null */
  tenant_id: number | null
  tenant_name: string
  phone: string
  property_type: PropertyType
  property_id: number | null
  property_name: string | null
  appoint_time: string | null
  status: ViewingStatus
  remark: string | null
  /** 转为签约后关联的租约 id */
  lease_id: number | null
  created_at: string
  updated_at: string
  follow_up_count: number
}

export interface ViewingFollowUp {
  id: number
  viewing_id: number
  content: string
  follow_up_at: string
  operator: string | null
  created_at: string
}

export interface ViewingDetail extends Viewing {
  follow_ups: ViewingFollowUp[]
  lease_no: string | null
}

/** 页头状态统计：忽略状态筛选，仅按其余条件聚合 */
export interface ViewingStats {
  pending: number
  appointed: number
  viewed: number
  no_intent: number
  signed: number
  total: number
}

// ==================== 报修工单 ====================

/** 待派单 → 维修中 → 已完工 → 已关闭，已关闭为终态 */
export type WorkOrderStatus = 'pending' | 'repairing' | 'done' | 'closed'

export interface WorkOrder {
  id: number
  order_no: string
  property_type: PropertyType
  /** 未关联具体房源时为 null，仅记录业态 */
  property_id: number | null
  property_name: string | null
  reporter: string
  phone: string | null
  fault_desc: string
  /** 故障图片访问路径，形如 /uploads/workorder/xxx.jpg */
  images: string[]
  status: WorkOrderStatus
  /** 维修人员，派单后必填 */
  assignee: string | null
  /** 维修费用（元） */
  cost: number
  /** 最近一次维修进度说明 */
  progress: string | null
  finish_remark: string | null
  created_at: string
  updated_at: string
}

/** 列表页页头统计：忽略状态筛选聚合，保证切换状态时其余数字仍有参考意义 */
export interface WorkOrderStats {
  pending: number
  repairing: number
  done: number
  closed: number
  total: number
  /** 累计维修费用 */
  total_cost: number
  /** 本月新增工单数 */
  month_new: number
}

/** 按房源聚合的维修统计 */
export interface WorkOrderPropertyStat {
  property_type: PropertyType
  property_id: number | null
  property_name: string | null
  /** 维修次数 */
  order_count: number
  /** 未完工数（待派单 + 维修中） */
  open_count: number
  /** 累计维修费用 */
  total_cost: number
}

