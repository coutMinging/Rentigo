import { Router } from 'express'
import { db, getAll, getOne } from '../../db'
import { authRequired } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/error'
import { requirePermission } from '../../middleware/permission'
import { round2 } from '../../utils/billing'
import { ok } from '../../utils/response'
import { addDays, todayStr } from '../bill/service'
import { LEASE_STATUS_LABEL } from '../lease/service'
import { config } from '../../config'

export const dashboardRouter = Router()
dashboardRouter.use(authRequired)

/** 出租率 = 已出租 / (总数 - 停用/维修不可租) */
function rateOf(rented: number, rentable: number): number {
  if (rentable <= 0) return 0
  return Math.round((rented / rentable) * 1000) / 10
}

dashboardRouter.get(
  '/',
  requirePermission('dashboard', 'view'),
  asyncHandler(async (_req, res) => {
    const today = todayStr()
    const monthStart = `${today.slice(0, 7)}-01`
    const monthEnd = `${today.slice(0, 7)}-31`
    const warnDate = addDays(today, config.leaseWarnDays)

    // ===== 房源数据 =====
    const factoryStat = getOne<{ total: number; rented: number; vacant: number; disabled: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'rented' THEN 1 ELSE 0 END) AS rented,
              SUM(CASE WHEN status = 'vacant' THEN 1 ELSE 0 END) AS vacant,
              SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled
         FROM factories`,
    )!

    const apartmentStat = getOne<{ total: number; rented: number; vacant: number; repair: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'rented' THEN 1 ELSE 0 END) AS rented,
              SUM(CASE WHEN status = 'vacant' THEN 1 ELSE 0 END) AS vacant,
              SUM(CASE WHEN status = 'repair' THEN 1 ELSE 0 END) AS repair
         FROM apartments`,
    )!

    const factoryRentable = factoryStat.total - factoryStat.disabled
    const apartmentRentable = apartmentStat.total - apartmentStat.repair

    const totalRentable = factoryRentable + apartmentRentable
    const totalRented = factoryStat.rented + apartmentStat.rented

    // ===== 租约数据 =====
    const leaseStat = getOne<{ active: number; expiring: number; expired: number; breach: number }>(
      `SELECT
         SUM(CASE WHEN status = 'active'   THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'expiring' THEN 1 ELSE 0 END) AS expiring,
         SUM(CASE WHEN status = 'expired'  THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN status = 'breach'   THEN 1 ELSE 0 END) AS breach
       FROM leases`,
    )!

    // ===== 财务数据 =====
    const monthFinance = getOne<{ payable: number; paid: number; deduction: number }>(
      `SELECT COALESCE(SUM(payable_amount),0) AS payable,
              COALESCE(SUM(paid_amount),0) AS paid,
              COALESCE(SUM(decoration_deduction),0) AS deduction
         FROM bills WHERE period_start >= ? AND period_start <= ?`,
      [monthStart, monthEnd],
    )!

    const totalDeduction = getOne<{ deduction: number }>(
      'SELECT COALESCE(SUM(decoration_deduction),0) AS deduction FROM bills',
    )!

    const arrears = getOne<{ owed: number; count: number }>(
      `SELECT COALESCE(SUM(payable_amount - paid_amount),0) AS owed, COUNT(*) AS count
         FROM bills WHERE payable_amount > paid_amount AND due_date < ?`,
      [today],
    )!

    // ===== 运营数据 =====
    const viewingsThisMonth = getOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM viewings WHERE created_at >= ?',
      [monthStart],
    )!
    const signedThisMonth = getOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM leases WHERE sign_date >= ? AND sign_date <= ?',
      [monthStart, monthEnd],
    )!
    const workOrdersOpen = getOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM work_orders WHERE status IN ('pending','repairing')",
    )!

    // ===== 近 12 个月收支趋势 =====
    const trendRows = getAll<{ bucket: string; payable: number; paid: number }>(
      `SELECT substr(period_start, 1, 7) AS bucket,
              COALESCE(SUM(payable_amount),0) AS payable,
              COALESCE(SUM(paid_amount),0) AS paid
         FROM bills
        WHERE period_start >= date('now','localtime','-11 months','start of month')
        GROUP BY bucket ORDER BY bucket`,
    )

    const trend = trendRows.map((r) => ({
      bucket: r.bucket,
      payable: round2(r.payable),
      paid: round2(r.paid),
    }))

    // ===== 到期与逾期预警列表 =====
    const expiringLeases = getAll<Record<string, unknown>>(
      `SELECT l.id, l.lease_no, l.end_date, l.property_type, l.monthly_rent,
              t.name AS tenant_name, t.phone AS tenant_phone,
              CAST(julianday(l.end_date) - julianday(date('now','localtime')) AS INTEGER) AS days_left
         FROM leases l JOIN tenants t ON t.id = l.tenant_id
        WHERE l.status = 'expiring' AND l.end_date <= ?
        ORDER BY l.end_date ASC LIMIT 8`,
      [warnDate],
    )

    const overdueBills = getAll<Record<string, unknown>>(
      `SELECT b.id, b.bill_no, b.due_date, b.property_type,
              b.payable_amount, b.paid_amount, b.status,
              (b.payable_amount - b.paid_amount) AS outstanding,
              t.name AS tenant_name,
              CAST(julianday(date('now','localtime')) - julianday(b.due_date) AS INTEGER) AS overdue_days
         FROM bills b JOIN tenants t ON t.id = b.tenant_id
        WHERE b.payable_amount > b.paid_amount AND b.due_date < ?
        ORDER BY b.due_date ASC LIMIT 8`,
      [today],
    )

    // ===== 业态收入分布（用于环形图）=====
    const byType = getAll<{ property_type: string; payable: number; paid: number }>(
      `SELECT property_type,
              COALESCE(SUM(payable_amount),0) AS payable,
              COALESCE(SUM(paid_amount),0) AS paid
         FROM bills GROUP BY property_type`,
    )

    // ===== 最新公告 =====
    const announcements = getAll(
      `SELECT id, title, category, is_top, publisher, created_at
         FROM announcements ORDER BY is_top DESC, id DESC LIMIT 5`,
    )

    ok(res, {
      property: {
        factory: {
          total: factoryStat.total,
          rented: factoryStat.rented,
          vacant: factoryStat.vacant,
          disabled: factoryStat.disabled,
          rate: rateOf(factoryStat.rented, factoryRentable),
        },
        apartment: {
          total: apartmentStat.total,
          rented: apartmentStat.rented,
          vacant: apartmentStat.vacant,
          repair: apartmentStat.repair,
          rate: rateOf(apartmentStat.rented, apartmentRentable),
        },
        overall_rate: rateOf(totalRented, totalRentable),
      },
      lease: {
        active: leaseStat.active,
        expiring: leaseStat.expiring,
        expired: leaseStat.expired,
        breach: leaseStat.breach,
        total: leaseStat.active + leaseStat.expiring + leaseStat.expired + leaseStat.breach,
      },
      finance: {
        month_payable: round2(monthFinance.payable),
        month_paid: round2(monthFinance.paid),
        month_deduction: round2(monthFinance.deduction),
        total_deduction: round2(totalDeduction.deduction),
        arrears_amount: round2(arrears.owed),
        arrears_count: arrears.count,
      },
      operation: {
        viewings_this_month: viewingsThisMonth.c,
        signed_this_month: signedThisMonth.c,
        work_orders_open: workOrdersOpen.c,
      },
      trend,
      by_type: byType.map((r) => ({
        property_type: r.property_type,
        type_label: r.property_type === 'factory' ? '厂房' : '公寓',
        payable: round2(r.payable),
        paid: round2(r.paid),
      })),
      warnings: {
        expiring_leases: expiringLeases.map((r) => ({
          ...r,
          status_label: LEASE_STATUS_LABEL.expiring,
        })),
        overdue_bills: overdueBills.map((r) => ({
          ...r,
          outstanding: round2(Number(r.outstanding)),
        })),
      },
      announcements,
      warn_days: config.leaseWarnDays,
      today,
    })
  }),
)
