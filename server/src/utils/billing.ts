/**
 * 账单期次拆解与「装修费抵扣租金」核算。
 *
 * 这是全系统唯一的核算真源，被三处复用：
 *   1. 新建租约时的实时试算预览
 *   2. 租约保存时批量生成账单
 *   3. 财务报表的装修抵扣统计
 * 集中在一个纯函数里，避免三套算法各自漂移。
 */

export type PayCycle = 'month' | 'quarter' | 'year'

export interface BillPlanInput {
  /** 租期起始 YYYY-MM-DD */
  startDate: string
  /** 租期结束 YYYY-MM-DD */
  endDate: string
  /** 缴费周期 */
  payCycle: PayCycle
  /** Σ 关联房源的月租金 */
  monthlyRent: number
  /** 月物业费 */
  monthlyPropertyFee: number
  /** 装修总金额，0 表示不抵扣 */
  decorationTotal: number
  /** 抵扣期数 */
  decorationPeriods: number
  /** 每期抵扣额，缺省 = 装修总金额 / 抵扣期数 */
  decorationPerMonth?: number
}

export interface BillPlanItem {
  /** 第几期，从 1 开始 */
  periodIndex: number
  periodStart: string
  periodEnd: string
  /** 应交日期（取期初） */
  dueDate: string
  /** 当期租金 */
  rentAmount: number
  /** 当期物业费 */
  propertyFee: number
  /** 当期装修抵扣额（累计不超过装修总金额） */
  decorationDeduction: number
  /** 当期实际应付 = 租金 + 物业费 − 抵扣 */
  payableAmount: number
}

const CYCLE_MONTHS: Record<PayCycle, number> = {
  month: 1,
  quarter: 3,
  year: 12,
}

/** 四舍五入到 2 位小数，规避浮点误差累积 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function parseDate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}

/** 某年某月的天数（m 为 1-12） */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

/** 日期加 n 个月，自动处理月末（如 1-31 加一月得 2-28） */
function addMonths(date: string, n: number): string {
  const { y, m, d } = parseDate(date)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const nd = Math.min(d, daysInMonth(ny, nm))
  return fmt(ny, nm, nd)
}

/** 某月 1 号 */
function firstDayOfNextMonth(date: string): string {
  const { y, m } = parseDate(date)
  const total = y * 12 + m
  return fmt(Math.floor(total / 12), (total % 12) + 1, 1)
}

/** 日期加 n 天 */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + n)
  return fmt(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** 两个日期相差的天数（end 不含当天） */
function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * 统计 [start, end) 区间折合多少个月。
 * 按自然月逐段累计，不足整月的部分按当月天数折算，
 * 这样 1-15 到 2-15 得 1.0 个月，1-20 到 2-10 得 0.68 个月。
 */
function monthSpan(start: string, end: string): number {
  let sum = 0
  let cursor = start

  // 防御：最多循环 600 段（50 年），避免异常数据造成死循环
  for (let guard = 0; guard < 600 && cursor < end; guard += 1) {
    const { y, m } = parseDate(cursor)
    const next = firstDayOfNextMonth(cursor)
    const segEnd = next < end ? next : end
    const dim = daysInMonth(y, m)
    const segDays = daysBetween(cursor, segEnd)
    sum += segDays / dim
    cursor = segEnd
  }

  return Math.round(sum * 10000) / 10000
}

/**
 * 生成完整的账单期次计划。
 *
 * 规则：
 *   每期租金   = Σ(房源月租) × 当期折合月数
 *   每期物业费 = 月物业费 × 当期折合月数
 *   每期抵扣   = 期次序号 ≤ 抵扣期数 ? min(每期抵扣额, 装修总金额剩余未抵扣额) : 0
 *   当期应付   = 租金 + 物业费 − 当期抵扣（抵扣只冲减租金部分，累计不超过装修总金额）
 */
export function buildBillPlan(input: BillPlanInput): BillPlanItem[] {
  const {
    startDate,
    endDate,
    payCycle,
    monthlyRent,
    monthlyPropertyFee,
    decorationTotal,
    decorationPeriods,
  } = input

  if (!startDate || !endDate || startDate >= endDate) return []

  // 每期抵扣额：优先用显式传入的值，否则由总金额平分
  const perPeriod =
    input.decorationPerMonth && input.decorationPerMonth > 0
      ? round2(input.decorationPerMonth)
      : decorationPeriods > 0
        ? round2(decorationTotal / decorationPeriods)
        : 0

  const cycle = CYCLE_MONTHS[payCycle] ?? 1

  const items: BillPlanItem[] = []
  let cursor = startDate
  let periodIndex = 1
  let remainingDecoration = round2(Math.max(decorationTotal, 0))

  for (let guard = 0; guard < 600 && cursor < endDate; guard += 1) {
    const rawEnd = addMonths(cursor, cycle)
    const periodEnd = rawEnd > endDate ? endDate : rawEnd

    // 租期结束日含当天，所以最后一段按「次日」作为折算终点，
    // 否则恰好 12 个月的租期会少算最后一天，导致应收金额偏低
    const spanEnd = periodEnd === endDate ? addDays(periodEnd, 1) : periodEnd
    const months = monthSpan(cursor, spanEnd)
    const rentAmount = round2(monthlyRent * months)
    const propertyFee = round2(monthlyPropertyFee * months)

    // 抵扣仅在前 N 期生效，且累计不得超过装修总金额
    let deduction = 0
    if (periodIndex <= decorationPeriods && remainingDecoration > 0 && perPeriod > 0) {
      deduction = round2(Math.min(perPeriod, remainingDecoration))
      remainingDecoration = round2(remainingDecoration - deduction)
    }

    // 装修抵扣只冲减租金部分，物业费照常收取
    const deductionApplied = Math.min(deduction, rentAmount)
    const payableAmount = round2(rentAmount + propertyFee - deductionApplied)

    items.push({
      periodIndex,
      periodStart: cursor,
      periodEnd,
      dueDate: cursor,
      rentAmount,
      propertyFee,
      decorationDeduction: deductionApplied,
      payableAmount: payableAmount < 0 ? 0 : payableAmount,
    })

    cursor = periodEnd
    periodIndex += 1
  }

  return items
}

/** 试算结果的汇总信息，用于租约表单实时预览 */
export interface BillPlanSummary {
  periodCount: number
  totalRent: number
  totalPropertyFee: number
  totalDecorationDeduction: number
  totalPayable: number
  /** 未抵扣完的装修余额 */
  decorationRemainder: number
}

export function summarizePlan(items: BillPlanItem[], decorationTotal: number): BillPlanSummary {
  const totalRent = round2(items.reduce((s, i) => s + i.rentAmount, 0))
  const totalPropertyFee = round2(items.reduce((s, i) => s + i.propertyFee, 0))
  const totalDecorationDeduction = round2(items.reduce((s, i) => s + i.decorationDeduction, 0))
  const totalPayable = round2(items.reduce((s, i) => s + i.payableAmount, 0))

  return {
    periodCount: items.length,
    totalRent,
    totalPropertyFee,
    totalDecorationDeduction,
    totalPayable,
    decorationRemainder: round2(Math.max(decorationTotal - totalDecorationDeduction, 0)),
  }
}
