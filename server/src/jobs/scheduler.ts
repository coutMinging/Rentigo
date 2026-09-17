import { db } from '../db'
import { config } from '../config'

/**
 * 轻量定时任务：把"时间推移导致的状态变化"落库。
 * 不引入 Redis / 消息队列，服务启动跑一次 + 每 30 分钟跑一次，
 * 符合单机后台的数据规模。
 */

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

export interface TickResult {
  overdueBills: number
  expiredLeases: number
  expiringLeases: number
  notifications: number
}

export function runSchedulerTick(): TickResult {
  const today = todayStr()
  const warnDate = addDays(today, config.leaseWarnDays)

  // 1. 待收款账单过了应交日期 → 逾期欠费
  const overdueBills = db
    .prepare(
      `UPDATE bills
         SET status = 'overdue', updated_at = datetime('now','localtime')
       WHERE status = 'pending' AND due_date < ?`,
    )
    .run(today).changes

  // 2. 租约到期状态流转
  const expiredLeases = db
    .prepare(
      `UPDATE leases
         SET status = 'expired', updated_at = datetime('now','localtime')
       WHERE status IN ('active','expiring') AND end_date < ?`,
    )
    .run(today).changes

  const expiringLeases = db
    .prepare(
      `UPDATE leases
         SET status = 'expiring', updated_at = datetime('now','localtime')
       WHERE status = 'active' AND end_date >= ? AND end_date <= ?`,
    )
    .run(today, warnDate).changes

  // 3. 站内消息：逾期账单 + 即将到期租约（按天去重，避免每 30 分钟刷屏）
  const overdueNotifications = createOverdueNotifications(today)
  const expireNotifications = createExpireNotifications(today, warnDate)

  return {
    overdueBills,
    expiredLeases,
    expiringLeases,
    notifications: overdueNotifications + expireNotifications,
  }
}

function notificationExists(type: string, relatedId: number, day: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM notifications
       WHERE type = ? AND related_id = ? AND date(created_at) = date(?)`,
    )
    .get(type, relatedId, day) as { c: number }
  return row.c > 0
}

function createOverdueNotifications(today: string): number {
  const bills = db
    .prepare(
      `SELECT id, bill_no, payable_amount, paid_amount, property_type
         FROM bills WHERE status = 'overdue'`,
    )
    .all() as Array<{
    id: number
    bill_no: string
    payable_amount: number
    paid_amount: number
    property_type: string
  }>

  const insert = db.prepare(
    'INSERT INTO notifications (type, title, content, level, related_id) VALUES (?, ?, ?, ?, ?)',
  )

  let count = 0
  for (const bill of bills) {
    if (notificationExists('bill_overdue', bill.id, today)) continue
    const owed = Math.round((bill.payable_amount - bill.paid_amount) * 100) / 100
    const bizName = bill.property_type === 'factory' ? '厂房' : '公寓'
    insert.run(
      'bill_overdue',
      `账单逾期：${bill.bill_no}`,
      `${bizName}账单 ${bill.bill_no} 已过应交日期，尚欠 ${owed.toLocaleString('zh-CN')} 元，请及时催收。`,
      'danger',
      bill.id,
    )
    count += 1
  }
  return count
}

function createExpireNotifications(today: string, warnDate: string): number {
  const leases = db
    .prepare(
      `SELECT l.id, l.lease_no, l.end_date, l.property_type, t.name AS tenant_name
         FROM leases l JOIN tenants t ON t.id = l.tenant_id
        WHERE l.status = 'expiring' AND l.end_date >= ? AND l.end_date <= ?`,
    )
    .all(today, warnDate) as Array<{
    id: number
    lease_no: string
    end_date: string
    property_type: string
    tenant_name: string
  }>

  const insert = db.prepare(
    'INSERT INTO notifications (type, title, content, level, related_id) VALUES (?, ?, ?, ?, ?)',
  )

  let count = 0
  for (const lease of leases) {
    if (notificationExists('lease_expire', lease.id, today)) continue
    insert.run(
      'lease_expire',
      `租约即将到期：${lease.lease_no}`,
      `租客「${lease.tenant_name}」的租约将于 ${lease.end_date} 到期，请提前联系确认续租或退租。`,
      'warning',
      lease.id,
    )
    count += 1
  }
  return count
}

/** 启动定时任务：立即执行一次，之后每 30 分钟一次 */
export function startScheduler(): NodeJS.Timeout {
  const runSafe = () => {
    try {
      const result = runSchedulerTick()
      const changed =
        result.overdueBills + result.expiredLeases + result.expiringLeases + result.notifications
      if (changed > 0) {
        console.log(
          `[scheduler] 逾期账单 ${result.overdueBills} · 已到期 ${result.expiredLeases} · 即将到期 ${result.expiringLeases} · 新增消息 ${result.notifications}`,
        )
      }
    } catch (err) {
      console.error('[scheduler] 执行失败:', err)
    }
  }

  runSafe()
  return setInterval(runSafe, 30 * 60 * 1000)
}
