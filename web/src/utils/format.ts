import dayjs from 'dayjs'

/** 金额格式化：千分位 + 两位小数 */
export function money(value: unknown, withSymbol = false): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return withSymbol ? '¥0.00' : '0.00'
  const text = n.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return withSymbol ? `¥${text}` : text
}

/** 大额金额紧凑显示：12.34 万 / 1.23 亿 */
export function moneyCompact(value: unknown): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 100000000) return `${(n / 100000000).toFixed(2)} 亿`
  if (abs >= 10000) return `${(n / 10000).toFixed(2)} 万`
  return money(n)
}

/** 数字千分位 */
export function numberText(value: unknown): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('zh-CN')
}

/** 面积：去掉无意义的小数零 */
export function areaText(value: unknown): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** 百分比 */
export function percent(value: unknown, digits = 1): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0%'
  return `${n.toFixed(digits)}%`
}

/** 日期：YYYY-MM-DD */
export function dateText(value?: string | null): string {
  if (!value) return '—'
  return dayjs(value).format('YYYY-MM-DD')
}

/** 日期时间：YYYY-MM-DD HH:mm */
export function dateTimeText(value?: string | null): string {
  if (!value) return '—'
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}

/** 账期区间显示 */
export function periodText(start?: string | null, end?: string | null): string {
  if (!start || !end) return '—'
  return `${dayjs(start).format('YYYY-MM-DD')} ~ ${dayjs(end).format('YYYY-MM-DD')}`
}

/** 相对今天的剩余天数描述 */
export function daysLeftText(days: number): string {
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  return `剩余 ${days} 天`
}

/** 手机号脱敏 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '—'
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone
}

/** 取名字首字，用于头像占位 */
export function initialOf(name?: string | null): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}
