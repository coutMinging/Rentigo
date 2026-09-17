import bcrypt from 'bcryptjs'
import { db } from './index'
import { isEmptyDatabase, migrate } from './migrate'
import { buildBillPlan } from '../utils/billing'
import { makeApartmentCode, makeBillNo, makeFactoryCode, makeLeaseNo } from '../utils/id'
import { config } from '../config'

// ==================== 日期工具 ====================

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function todayStr(): string {
  return toStr(new Date())
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toStr(d)
}

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const last = new Date(ny, nm, 0).getDate()
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`
}

// ==================== 枚举与状态推导 ====================

type PayCycle = 'month' | 'quarter' | 'year'

function leaseStatusOf(endDate: string, warnDays: number): string {
  const today = todayStr()
  if (endDate < today) return 'expired'
  if (endDate <= addDays(today, warnDays)) return 'expiring'
  return 'active'
}

function billStatusOf(payable: number, paid: number, dueDate: string): string {
  if (paid >= payable && payable > 0) return 'paid'
  if (paid > 0) return 'partial'
  return dueDate < todayStr() ? 'overdue' : 'pending'
}

// ==================== 角色权限集 ====================

const PERMISSION_SETS = {
  admin: {
    dashboard: ['view', 'export'],
    property: ['view', 'create', 'edit', 'delete', 'export'],
    tenant: ['view', 'create', 'edit', 'delete', 'export'],
    lease: ['view', 'create', 'edit', 'delete', 'export'],
    bill: ['view', 'create', 'edit', 'delete', 'export'],
    workOrder: ['view', 'create', 'edit', 'delete', 'export'],
    viewing: ['view', 'create', 'edit', 'delete', 'export'],
    system: ['view', 'create', 'edit', 'delete', 'export'],
  },
  finance: {
    dashboard: ['view', 'export'],
    property: ['view'],
    tenant: ['view'],
    lease: ['view'],
    bill: ['view', 'create', 'edit', 'export'],
    system: ['view'],
  },
  ops: {
    dashboard: ['view'],
    property: ['view', 'edit'],
    tenant: ['view'],
    lease: ['view'],
    bill: ['view'],
    workOrder: ['view', 'create', 'edit', 'export'],
    viewing: ['view', 'create', 'edit'],
  },
}

// ==================== 主流程 ====================

export function seed(): void {
  migrate()

  if (!isEmptyDatabase()) {
    console.log('[db] 已存在数据，跳过种子写入（如需重置请删除 server/data/app.db*）')
    return
  }

  console.log('[db] 开始写入种子数据…')

  const runAll = db.transaction(() => {
    seedRolesAndUsers()
    seedSettings()
    seedAnnouncements()
    seedFactories()
    seedApartments()
    seedTenantsAndLeases()
    syncPropertyStatus()
  })

  runAll()
  console.log('[db] 种子数据写入完成')
  console.log('[db] 默认账号：admin / finance / ops，密码均为 123456')
}

// ---------- 角色与账号 ----------

function seedRolesAndUsers(): void {
  const insertRole = db.prepare(
    'INSERT INTO roles (name, code, permissions, is_preset, remark) VALUES (?, ?, ?, 1, ?)',
  )

  const adminRoleId = Number(
    insertRole.run('超级管理员', 'admin', JSON.stringify(PERMISSION_SETS.admin), '拥有全部模块权限')
      .lastInsertRowid,
  )
  const financeRoleId = Number(
    insertRole.run(
      '财务人员',
      'finance',
      JSON.stringify(PERMISSION_SETS.finance),
      '仅可查看收支数据，不可修改房源租约',
    ).lastInsertRowid,
  )
  const opsRoleId = Number(
    insertRole.run(
      '物业运维人员',
      'ops',
      JSON.stringify(PERMISSION_SETS.ops),
      '主要负责报修工单与看房登记',
    ).lastInsertRowid,
  )

  const hash = bcrypt.hashSync('123456', 10)
  const insertUser = db.prepare(
    'INSERT INTO users (username, password, real_name, phone, role_id, status) VALUES (?, ?, ?, ?, ?, ?)',
  )

  insertUser.run('admin', hash, '系统管理员', '13800000001', adminRoleId, 'active')
  insertUser.run('finance', hash, '李财务', '13800000002', financeRoleId, 'active')
  insertUser.run('ops', hash, '王运维', '13800000003', opsRoleId, 'active')
}

// ---------- 系统参数 ----------

function seedSettings(): void {
  const rows: Array<[string, string, string]> = [
    ['rent_unit', '元/㎡/月', '租金计价单位'],
    ['default_lease_months', '12', '默认租期（月）'],
    ['deposit_rule', '押二付三', '押金规则'],
    ['lease_warn_days', String(config.leaseWarnDays), '租约到期提醒提前天数'],
    ['sms_enabled', 'false', '短信通知开关（第三方接口预留）'],
    ['esign_enabled', 'false', '电子签章开关（第三方接口预留）'],
  ]

  const insert = db.prepare('INSERT INTO settings (key, value, label) VALUES (?, ?, ?)')
  for (const [key, value, label] of rows) insert.run(key, value, label)
}

function seedAnnouncements(): void {
  const rows: Array<[string, string, string, number]> = [
    [
      '园区 9 月停电检修通知',
      '为配合供电局线路改造，9 月 22 日 08:00-17:00 对 A 厂区实施计划停电。请各租户提前安排生产，冷库、精密设备请自行做好断电保护。',
      'power',
      1,
    ],
    [
      '厂房安全整改复查安排',
      '国庆前将开展消防通道、危化品存放专项复查。请各企业于 9 月 25 日前完成自查并提交整改照片。',
      'safety',
      0,
    ],
    [
      '公寓水费结算标准调整',
      '自 10 月起公寓商用水费调整为 4.80 元/吨，民用水费维持 3.20 元/吨不变，将在当期账单中体现。',
      'water',
      0,
    ],
    [
      '租赁合同续签提醒',
      '合同到期前 30 天可启动续签，请提前与物业对接租期与租金调整事宜，避免影响正常经营。',
      'rule',
      0,
    ],
  ]

  const insert = db.prepare(
    'INSERT INTO announcements (title, content, category, is_top, publisher) VALUES (?, ?, ?, ?, ?)',
  )
  for (const [title, content, category, isTop] of rows) {
    insert.run(title, content, category, isTop, '系统管理员')
  }
}

// ---------- 厂房房源 ----------

const FACTORY_SEED = [
  {
    name: 'A1 号标准厂房',
    address: '杭州市萧山区智造园区兴业路 18 号 A1 幢',
    totalArea: 3200,
    divisibleArea: 1600,
    floorHeight: 9,
    floorLoad: 3,
    floorType: '金刚砂耐磨地坪',
    transformer: 630,
    hasCrane: 1,
    craneTonnage: 10,
    fireRating: '丙二类',
    envApproved: 1,
    independentYard: 1,
    dormArea: 320,
    yardArea: 800,
    truckAccess: '可通行 17.5 米平板车，双向车道',
    forbidden: '化工、喷漆、危化品仓储、高噪声锻造',
    rentPrice: 26,
    propertyFee: 2.5,
    waterPrice: 4.2,
    electricPrice: 1.05,
    minLeaseMonths: 24,
    allowSublet: 1,
    status: 'vacant',
    remark: '层高充足，带 10 吨行车，适合机械加工与装备制造。',
  },
  {
    name: 'A2 号标准厂房',
    address: '杭州市萧山区智造园区兴业路 18 号 A2 幢',
    totalArea: 2400,
    divisibleArea: 1200,
    floorHeight: 7.5,
    floorLoad: 2.5,
    floorType: '环氧地坪',
    transformer: 400,
    hasCrane: 0,
    craneTonnage: null as number | null,
    fireRating: '丙二类',
    envApproved: 1,
    independentYard: 0,
    dormArea: 0,
    yardArea: 300,
    truckAccess: '可通行 9.6 米货车',
    forbidden: '电镀、酸洗、喷塑',
    rentPrice: 22,
    propertyFee: 2.2,
    waterPrice: 4.2,
    electricPrice: 1.05,
    minLeaseMonths: 12,
    allowSublet: 0,
    status: 'vacant',
    remark: '可整租或对半分割，适合轻工装配、仓储分拣。',
  },
  {
    name: 'B1 号重型厂房',
    address: '杭州市萧山区智造园区兴业路 26 号 B1 幢',
    totalArea: 4800,
    divisibleArea: 0,
    floorHeight: 12,
    floorLoad: 5,
    floorType: '钢纤维混凝土地坪',
    transformer: 1000,
    hasCrane: 1,
    craneTonnage: 20,
    fireRating: '丁类',
    envApproved: 1,
    independentYard: 1,
    dormArea: 600,
    yardArea: 1500,
    truckAccess: '可通行 20 米挂车，专用装卸平台',
    forbidden: '化工、易燃易爆品',
    rentPrice: 32,
    propertyFee: 3,
    waterPrice: 4.2,
    electricPrice: 0.98,
    minLeaseMonths: 36,
    allowSublet: 0,
    status: 'vacant',
    remark: '重型设备厂房，20 吨行车，适合大型装备制造。',
  },
  {
    name: 'B2 号中型厂房',
    address: '杭州市萧山区智造园区兴业路 26 号 B2 幢',
    totalArea: 1800,
    divisibleArea: 900,
    floorHeight: 8,
    floorLoad: 3,
    floorType: '金刚砂耐磨地坪',
    transformer: 315,
    hasCrane: 1,
    craneTonnage: 5,
    fireRating: '丙二类',
    envApproved: 0,
    independentYard: 0,
    dormArea: 200,
    yardArea: 260,
    truckAccess: '可通行 9.6 米货车',
    forbidden: '涉气涉水排污行业',
    rentPrice: 24,
    propertyFee: 2.4,
    waterPrice: 4.2,
    electricPrice: 1.05,
    minLeaseMonths: 12,
    allowSublet: 1,
    status: 'vacant',
    remark: '暂无环评指标，仅限无污染轻工行业入驻。',
  },
  {
    name: 'C1 号仓储厂房',
    address: '杭州市萧山区智造园区兴业路 33 号 C1 幢',
    totalArea: 5600,
    divisibleArea: 2800,
    floorHeight: 10,
    floorLoad: 4,
    floorType: '混凝土地坪',
    transformer: 800,
    hasCrane: 0,
    craneTonnage: null as number | null,
    fireRating: '丙一类',
    envApproved: 1,
    independentYard: 1,
    dormArea: 0,
    yardArea: 2000,
    truckAccess: '双面月台，可同时停靠 6 台 17.5 米货车',
    forbidden: '危化品、冷链生鲜（无温控）',
    rentPrice: 20,
    propertyFee: 2,
    waterPrice: 4.2,
    electricPrice: 1.05,
    minLeaseMonths: 12,
    allowSublet: 1,
    status: 'vacant',
    remark: '标准仓储月台，适合电商仓、区域分拨中心。',
  },
  {
    name: 'C2 号小型厂房',
    address: '杭州市萧山区智造园区兴业路 33 号 C2 幢',
    totalArea: 900,
    divisibleArea: 450,
    floorHeight: 6.5,
    floorLoad: 2,
    floorType: '环氧地坪',
    transformer: 160,
    hasCrane: 0,
    craneTonnage: null as number | null,
    fireRating: '戊类',
    envApproved: 0,
    independentYard: 0,
    dormArea: 0,
    yardArea: 120,
    truckAccess: '仅可通行 4.2 米小货车',
    forbidden: '有明火作业行业',
    rentPrice: 18,
    propertyFee: 1.8,
    waterPrice: 4.2,
    electricPrice: 1.05,
    minLeaseMonths: 6,
    allowSublet: 0,
    status: 'disabled',
    remark: '屋面防水待修缮，暂不对外出租。',
  },
]

function seedFactories(): void {
  const insert = db.prepare(`
    INSERT INTO factories (
      code, name, address, total_area, divisible_area, floor_height, floor_load, floor_type,
      transformer_capacity, has_crane, crane_tonnage, fire_rating, env_approved, independent_yard,
      dorm_area, yard_area, truck_access, forbidden_industry,
      rent_price, property_fee, water_price, electric_price, min_lease_months, allow_sublet,
      status, images, remark
    ) VALUES (
      @code, @name, @address, @totalArea, @divisibleArea, @floorHeight, @floorLoad, @floorType,
      @transformer, @hasCrane, @craneTonnage, @fireRating, @envApproved, @independentYard,
      @dormArea, @yardArea, @truckAccess, @forbidden,
      @rentPrice, @propertyFee, @waterPrice, @electricPrice, @minLeaseMonths, @allowSublet,
      @status, '[]', @remark
    )
  `)

  FACTORY_SEED.forEach((f, i) => {
    insert.run({ ...f, code: makeFactoryCode(i + 1) })
  })
}

// ---------- 公寓房源（楼栋 → 楼层 → 房间） ----------

const BUILDING_SEED = [
  {
    name: '员工公寓 1 号楼',
    floors: 3,
    address: '杭州市萧山区智造园区生活区 1 号楼',
    hasElevator: 1,
    layouts: ['一室一卫', '一室一厅一卫', '两室一厅一卫', '一室一卫'],
    rentBase: 1350,
  },
  {
    name: '员工公寓 2 号楼',
    floors: 3,
    address: '杭州市萧山区智造园区生活区 2 号楼',
    hasElevator: 1,
    layouts: ['一室一厅一卫', '两室一厅一卫', '两室一厅一卫', '一室一卫'],
    rentBase: 1550,
  },
]

const FURNITURE_SET = '床、衣柜、书桌、空调、热水器、独立卫浴、宽带'
const ORIENTATIONS = ['南', '东南', '西南', '东', '北']

/**
 * 全部房间 id，按「楼栋 → 楼层 → 房号」顺序排列。
 * 租约模板通过下标引用这里的位置。
 */
const ALL_APARTMENT_IDS: number[] = []

function seedApartments(): void {
  const insertBuilding = db.prepare(
    'INSERT INTO buildings (name, floors, address, has_elevator) VALUES (?, ?, ?, ?)',
  )
  const insertApartment = db.prepare(`
    INSERT INTO apartments (
      code, building_id, building_name, floor, room_no, layout, area, orientation,
      has_elevator, furniture, allow_pet, occupancy_limit,
      monthly_rent, deposit_amount, property_fee, water_price, electric_price,
      utility_type, status, images, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)
  `)

  BUILDING_SEED.forEach((b, bi) => {
    const buildingId = Number(
      insertBuilding.run(b.name, b.floors, b.address, b.hasElevator).lastInsertRowid,
    )

    for (let floor = 1; floor <= b.floors; floor += 1) {
      for (let idx = 0; idx < 4; idx += 1) {
        const roomNo = `${floor}0${idx + 1}`
        const layout = b.layouts[idx]
        const isTwoRoom = layout.startsWith('两室')
        const area = isTwoRoom ? 62 + floor : 32 + floor * 2
        const monthlyRent = b.rentBase + (isTwoRoom ? 600 : 0) + floor * 50
        const deposit = monthlyRent * 2

        // 初始统一置为空置，租约创建完成后由 syncPropertyStatus 反写为已租，
        // 避免出现「状态已租但没有租约」的不一致数据
        const apartmentId = Number(
          insertApartment.run(
            makeApartmentCode(bi + 1, roomNo),
            buildingId,
            b.name,
            floor,
            roomNo,
            layout,
            area,
            ORIENTATIONS[idx % ORIENTATIONS.length],
            b.hasElevator,
            FURNITURE_SET,
            idx === 3 ? 1 : 0,
            isTwoRoom ? 4 : 2,
            monthlyRent,
            deposit,
            120,
            3.2,
            0.98,
            'civil',
            'vacant',
            '空置可随时看房，家具家电齐全。',
          ).lastInsertRowid,
        )

        ALL_APARTMENT_IDS.push(apartmentId)
      }
    }
  })
}

// ---------- 租客与租约 ----------

const TENANT_SEED = [
  { type: 'company', name: '杭州恒力精密机械有限公司', contact: '陈建国', phone: '13905710001', idCard: '91330109MA2AB10001', address: '萧山区兴业路 18 号 A1 幢' },
  { type: 'company', name: '浙江中拓智能装备股份有限公司', contact: '刘振华', phone: '13905710002', idCard: '91330109MA2AB10002', address: '萧山区兴业路 26 号 B1 幢' },
  { type: 'company', name: '杭州云仓供应链管理有限公司', contact: '赵敏', phone: '13905710003', idCard: '91330109MA2AB10003', address: '萧山区兴业路 33 号 C1 幢' },
  { type: 'company', name: '宁波兴达塑业有限公司杭州分公司', contact: '孙立军', phone: '13905710004', idCard: '91330109MA2AB10004', address: '萧山区兴业路 18 号 A2 幢' },
  { type: 'person', name: '周晓东', contact: null, phone: '13905710005', idCard: '330109199203151234', address: '萧山区智造园区生活区 1 号楼 201' },
  { type: 'person', name: '林婉清', contact: null, phone: '13905710006', idCard: '330109199508222345', address: '萧山区智造园区生活区 1 号楼 202' },
  { type: 'person', name: '吴国强', contact: null, phone: '13905710007', idCard: '330109198711093456', address: '萧山区智造园区生活区 2 号楼 104' },
  { type: 'person', name: '郑雪梅', contact: null, phone: '13905710008', idCard: '330109199801174567', address: '萧山区智造园区生活区 2 号楼 105' },
  { type: 'person', name: '何志远', contact: null, phone: '13905710009', idCard: '330109199405235678', address: '萧山区智造园区生活区 1 号楼 106' },
  { type: 'person', name: '蔡文俊', contact: null, phone: '13905710010', idCard: '330109199610086789', address: '萧山区智造园区生活区 2 号楼 107' },
  { type: 'person', name: '许静怡', contact: null, phone: '13905710011', idCard: '330109199902146790', address: '萧山区智造园区生活区 1 号楼 108' },
]

/** 租约模板：引用厂房/公寓在种子中的下标，由 seedTenantAndLeases 组装 */
interface LeaseTemplate {
  tenantIndex: number
  propertyType: 'factory' | 'apartment'
  propertyIndexes: number[]
  startDate: string
  endDate: string
  payCycle: PayCycle
  rentFactor: number
  propertyFeeFactor: number
  depositRatio: number
  decorationTotal: number
  decorationPeriods: number
  extraClause: string
  /** 收款情况：paidAll 全部已收，partial 部分收款，overdue 长期欠费 */
  payMode: 'paid' | 'partial' | 'overdue'
  tags: string[]
}

const LEASE_TEMPLATES: LeaseTemplate[] = [
  {
    tenantIndex: 0,
    propertyType: 'factory',
    propertyIndexes: [0],
    startDate: '2025-01-01',
    endDate: '2027-12-31',
    payCycle: 'quarter',
    rentFactor: 1,
    propertyFeeFactor: 1,
    depositRatio: 2,
    decorationTotal: 300000,
    decorationPeriods: 6,
    extraClause: '乙方装修方案须报甲方备案；退租时固定装修归甲方所有，可移动设备自行拆除。',
    payMode: 'paid',
    tags: ['signed'],
  },
  {
    tenantIndex: 1,
    propertyType: 'factory',
    propertyIndexes: [2],
    startDate: '2025-06-01',
    endDate: '2028-05-31',
    payCycle: 'month',
    rentFactor: 1,
    propertyFeeFactor: 1,
    depositRatio: 3,
    decorationTotal: 0,
    decorationPeriods: 0,
    extraClause: '重型设备进场需提前 3 日书面报备，甲方配合停送电安排。',
    payMode: 'paid',
    tags: ['signed'],
  },
  {
    tenantIndex: 2,
    propertyType: 'factory',
    propertyIndexes: [4],
    startDate: '2026-03-01',
    endDate: '2027-02-28',
    payCycle: 'quarter',
    rentFactor: 0.95,
    propertyFeeFactor: 1,
    depositRatio: 2,
    decorationTotal: 180000,
    decorationPeriods: 4,
    extraClause: '月台装卸区由甲乙双方共用，使用时段需另行协商。',
    payMode: 'overdue',
    tags: ['signed', 'arrears'],
  },
  {
    tenantIndex: 3,
    propertyType: 'factory',
    propertyIndexes: [3],
    startDate: '2024-09-01',
    endDate: '2026-10-10',
    payCycle: 'month',
    rentFactor: 1,
    propertyFeeFactor: 1,
    depositRatio: 2,
    decorationTotal: 60000,
    decorationPeriods: 12,
    extraClause: '合同到期前 30 天双方确认是否续租，逾期未回复视为不续租。',
    payMode: 'partial',
    tags: ['signed', 'renew'],
  },
  {
    tenantIndex: 4,
    propertyType: 'apartment',
    propertyIndexes: [0],
    startDate: '2026-01-01',
    endDate: '2027-12-31',
    payCycle: 'month',
    rentFactor: 1,
    propertyFeeFactor: 1,
    depositRatio: 2,
    decorationTotal: 0,
    decorationPeriods: 0,
    extraClause: '房间内家具家电如有损坏照价赔偿；禁止转租。',
    payMode: 'paid',
    tags: ['signed'],
  },
  {
    tenantIndex: 5,
    propertyType: 'apartment',
    propertyIndexes: [1],
    startDate: '2026-04-15',
    endDate: '2027-04-14',
    payCycle: 'quarter',
    rentFactor: 1,
    propertyFeeFactor: 1,
    depositRatio: 2,
    decorationTotal: 8000,
    decorationPeriods: 2,
    extraClause: '允许饲养小型宠物，需自行承担清洁与损坏责任。',
    payMode: 'partial',
    tags: ['signed'],
  },
  {
    tenantIndex: 6,
    propertyType: 'apartment',
    propertyIndexes: [2, 3],
    startDate: '2026-08-01',
    endDate: '2027-07-31',
    payCycle: 'month',
    rentFactor: 0.98,
    propertyFeeFactor: 1,
    depositRatio: 2,
    decorationTotal: 0,
    decorationPeriods: 0,
    extraClause: '企业集体宿舍用途，入住人员变动需报备物业。',
    payMode: 'paid',
    tags: ['signed'],
  },
  {
    tenantIndex: 7,
    propertyType: 'apartment',
    propertyIndexes: [4, 5, 6, 7],
    startDate: '2025-09-01',
    endDate: '2026-08-31',
    payCycle: 'quarter',
    rentFactor: 1,
    propertyFeeFactor: 1,
    depositRatio: 2,
    decorationTotal: 12000,
    decorationPeriods: 4,
    extraClause: '合同已到期，历史账单与押金台账保留备查。',
    payMode: 'paid',
    tags: ['signed'],
  },
]

function seedTenantsAndLeases(): void {
  const insertTenant = db.prepare(`
    INSERT INTO tenants (type, name, contact_name, phone, id_card, tags, address, remark)
    VALUES (@type, @name, @contact, @phone, @idCard, @tags, @address, @remark)
  `)

  const tenantIds: number[] = TENANT_SEED.map((t, i) => {
    return Number(
      insertTenant.run({
        ...t,
        tags: JSON.stringify(i < 4 ? ['signed'] : i === 6 ? ['signed', 'renew'] : ['signed']),
        remark: t.type === 'company' ? '企业租客，按季度对账。' : '个人租客，园区员工。',
      }).lastInsertRowid,
    )
  })

  const factoryRows = db
    .prepare('SELECT id, name, rent_price, property_fee, total_area FROM factories ORDER BY id')
    .all() as Array<{ id: number; name: string; rent_price: number; property_fee: number; total_area: number }>

  const apartmentRows = db
    .prepare(
      'SELECT id, code, room_no, monthly_rent, property_fee, area FROM apartments ORDER BY id',
    )
    .all() as Array<{
    id: number
    code: string
    room_no: string
    monthly_rent: number
    property_fee: number
    area: number
  }>

  const insertLease = db.prepare(`
    INSERT INTO leases (
      lease_no, tenant_id, property_type, start_date, end_date, pay_cycle,
      monthly_rent, monthly_property_fee, deposit_amount,
      decoration_total, decoration_periods, decoration_per_month, decoration_deducted,
      extra_clause, status, sign_date, remark
    ) VALUES (
      @leaseNo, @tenantId, @propertyType, @startDate, @endDate, @payCycle,
      @monthlyRent, @monthlyPropertyFee, @depositAmount,
      @decorationTotal, @decorationPeriods, @decorationPerMonth, 0,
      @extraClause, @status, @signDate, @remark
    )
  `)

  const insertLeaseItem = db.prepare(`
    INSERT INTO lease_items (lease_id, property_type, property_id, property_name, monthly_rent, monthly_property_fee)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const insertBill = db.prepare(`
    INSERT INTO bills (
      bill_no, lease_id, tenant_id, property_type, period_index,
      period_start, period_end, due_date,
      rent_amount, property_fee, other_amount, decoration_deduction, payable_amount,
      paid_amount, status, remark
    ) VALUES (
      @billNo, @leaseId, @tenantId, @propertyType, @periodIndex,
      @periodStart, @periodEnd, @dueDate,
      @rentAmount, @propertyFee, 0, @decorationDeduction, @payableAmount,
      @paidAmount, @status, NULL
    )
  `)

  const insertBillItem = db.prepare(
    'INSERT INTO bill_items (bill_id, type, name, amount) VALUES (?, ?, ?, ?)',
  )

  const insertPayment = db.prepare(`
    INSERT INTO payments (bill_id, lease_id, tenant_id, amount, pay_date, method, operator, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertDeposit = db.prepare(`
    INSERT INTO deposit_records (lease_id, tenant_id, type, amount, happen_date, remark, operator)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const today = todayStr()
  let seq = 0

  LEASE_TEMPLATES.forEach((tpl) => {
    seq += 1
    const leaseNo = makeLeaseNo(seq)
    const tenantId = tenantIds[tpl.tenantIndex]

    // 计算关联房源的月租金与月物业费
    let monthlyRent = 0
    let monthlyPropertyFee = 0
    const items: Array<{ id: number; name: string; rent: number; fee: number }> = []

    if (tpl.propertyType === 'factory') {
      for (const idx of tpl.propertyIndexes) {
        const f = factoryRows[idx]
        if (!f) continue
        const rent = Math.round(f.total_area * f.rent_price * tpl.rentFactor)
        const fee = Math.round(f.total_area * f.property_fee * tpl.propertyFeeFactor)
        items.push({ id: f.id, name: f.name, rent, fee })
        monthlyRent += rent
        monthlyPropertyFee += fee
      }
    } else {
      for (const idx of tpl.propertyIndexes) {
        const a = apartmentRows[idx]
        if (!a) continue
        const rent = Math.round(a.monthly_rent * tpl.rentFactor)
        const fee = Math.round(a.property_fee * tpl.propertyFeeFactor)
        items.push({ id: a.id, name: `${a.code} 房间`, rent, fee })
        monthlyRent += rent
        monthlyPropertyFee += fee
      }
    }

    const depositAmount = monthlyRent * tpl.depositRatio
    const decorationPerMonth =
      tpl.decorationPeriods > 0 ? Math.round(tpl.decorationTotal / tpl.decorationPeriods) : 0
    const status = leaseStatusOf(tpl.endDate, config.leaseWarnDays)

    const leaseId = Number(
      insertLease.run({
        leaseNo,
        tenantId,
        propertyType: tpl.propertyType,
        startDate: tpl.startDate,
        endDate: tpl.endDate,
        payCycle: tpl.payCycle,
        monthlyRent,
        monthlyPropertyFee,
        depositAmount,
        decorationTotal: tpl.decorationTotal,
        decorationPeriods: tpl.decorationPeriods,
        decorationPerMonth,
        extraClause: tpl.extraClause,
        status,
        signDate: tpl.startDate,
        remark: `种子数据，租约 ${leaseNo}`,
      }).lastInsertRowid,
    )

    for (const it of items) {
      insertLeaseItem.run(leaseId, tpl.propertyType, it.id, it.name, it.rent, it.fee)
    }

    // 押金收取记录
    if (depositAmount > 0) {
      insertDeposit.run(
        leaseId,
        tenantId,
        'collect',
        depositAmount,
        tpl.startDate,
        '签约时收取押金',
        '系统管理员',
      )
    }

    // 用统一核算函数生成账单，确保与业务逻辑一致
    const plan = buildBillPlan({
      startDate: tpl.startDate,
      endDate: tpl.endDate,
      payCycle: tpl.payCycle,
      monthlyRent,
      monthlyPropertyFee,
      decorationTotal: tpl.decorationTotal,
      decorationPeriods: tpl.decorationPeriods,
      decorationPerMonth,
    })

    let accumulatedDeduction = 0

    plan.forEach((period) => {
      accumulatedDeduction = Math.round((accumulatedDeduction + period.decorationDeduction) * 100) / 100

      // 只有「应交日期已过」的账单才可能收到钱，未来账期一律为待收款
      let paidAmount = 0
      const pastDue = period.dueDate < today

      if (pastDue) {
        if (tpl.payMode === 'paid') {
          paidAmount = period.payableAmount
        } else if (tpl.payMode === 'partial') {
          // 最近两期只收一半，形成「部分收款」样本
          const isRecent = period.dueDate >= addMonths(today, -2)
          paidAmount = isRecent ? Math.round(period.payableAmount * 0.5) : period.payableAmount
        } else {
          // overdue：最近三期一分未收，更早的账期正常结清
          const isRecent = period.dueDate >= addMonths(today, -3)
          paidAmount = isRecent ? 0 : period.payableAmount
        }
      }

      const billStatus = billStatusOf(period.payableAmount, paidAmount, period.dueDate)

      const billId = Number(
        insertBill.run({
          billNo: makeBillNo(leaseNo, period.periodIndex),
          leaseId,
          tenantId,
          propertyType: tpl.propertyType,
          periodIndex: period.periodIndex,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          dueDate: period.dueDate,
          rentAmount: period.rentAmount,
          propertyFee: period.propertyFee,
          decorationDeduction: period.decorationDeduction,
          payableAmount: period.payableAmount,
          paidAmount,
          status: billStatus,
        }).lastInsertRowid,
      )

      // 费用明细
      insertBillItem.run(billId, 'rent', '租金', period.rentAmount)
      if (period.propertyFee > 0) {
        insertBillItem.run(billId, 'property', '物业费', period.propertyFee)
      }
      if (period.decorationDeduction > 0) {
        insertBillItem.run(billId, 'deduction', '装修费抵扣', -period.decorationDeduction)
      }
      // 少量账单追加水电费，体现"手动追加其他费用"
      if (period.periodIndex % 3 === 0) {
        const utility = tpl.propertyType === 'factory' ? 4800 : 186
        insertBillItem.run(billId, 'water', '水费', utility * 0.25)
        insertBillItem.run(billId, 'electric', '电费', utility * 0.75)
      }

      // 收款流水
      if (paidAmount > 0) {
        insertPayment.run(
          billId,
          leaseId,
          tenantId,
          paidAmount,
          addDays(period.dueDate, 3),
          period.periodIndex % 2 === 0 ? 'transfer' : 'wechat',
          '李财务',
          billStatus === 'partial' ? '部分收款，余款待结' : '按期收款',
        )
      }
    })

    // 回写累计已抵扣金额
    db.prepare('UPDATE leases SET decoration_deducted = ? WHERE id = ?').run(
      accumulatedDeduction,
      leaseId,
    )
  })
}

/**
 * 房源状态由租约反推，避免出现「状态已出租但查不到租约」的矛盾数据。
 *   · 存在正常履约 / 即将到期的租约 → 已出租
 *   · 其余回到空置（空置停用、待维修的房源自建仓起保留原状态）
 */
function syncPropertyStatus(): void {
  db.prepare("UPDATE factories SET status = 'vacant' WHERE status != 'disabled'").run()
  db.prepare("UPDATE apartments SET status = 'vacant' WHERE status != 'repair'").run()

  const leased = db
    .prepare(
      `SELECT li.property_type, li.property_id
         FROM lease_items li
         JOIN leases l ON l.id = li.lease_id
        WHERE l.status IN ('active','expiring')`,
    )
    .all() as Array<{ property_type: string; property_id: number }>

  const updateFactory = db.prepare("UPDATE factories SET status = 'rented' WHERE id = ?")
  const updateApartment = db.prepare("UPDATE apartments SET status = 'rented' WHERE id = ?")

  for (const row of leased) {
    if (row.property_type === 'factory') updateFactory.run(row.property_id)
    else updateApartment.run(row.property_id)
  }
}

// ---------- 直接执行入口 ----------

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('/db/seed.ts')
if (isDirectRun) {
  seed()
}
