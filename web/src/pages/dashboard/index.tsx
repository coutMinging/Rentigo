import { useCallback, useEffect, useState } from 'react'
import { Button, Skeleton } from 'antd'
import { AlertTriangle, ArrowRight, CalendarClock, RefreshCw, TrendingUp } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { dashboardApi } from '../../api/bill'
import { ChartCard, KpiCard, MoneyText } from '../../components/DataDisplay'
import { PageCard, SectionTitle } from '../../components/Surface'
import { BILL_STATUS } from '../../utils/constants'
import { dateText, moneyCompact, numberText, periodText } from '../../utils/format'
import type { DashboardData } from '../../types'
import { OccupancyDonut, TrendChart } from './charts'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    dashboardApi
      .overview()
      .then(setData)
      .catch((err) => console.error('[dashboard] 加载失败:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !data) {
    return (
      <PageCard>
        <Skeleton active paragraph={{ rows: 10 }} />
      </PageCard>
    )
  }

  if (!data) {
    return (
      <PageCard>
        <div className="py-10 text-center">
          <p className="text-[14px] text-[#6E6E73]">看板数据加载失败</p>
          <Button className="mt-4" icon={<RefreshCw size={15} />} onClick={load}>
            重新加载
          </Button>
        </div>
      </PageCard>
    )
  }

  const { property, lease, finance, operation, trend, warnings, announcements } = data

  return (
    <div className="space-y-5">
      {/* 欢迎区 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-[#86868B]">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </p>
          <h1 className="mt-1.5 text-[28px] font-semibold leading-9 tracking-tight text-[#1D1D1F]">
            运营总览
          </h1>
          <p className="mt-1.5 text-[13.5px] text-[#86868B]">
            实时掌握出租率、收支与到期逾期情况，共 {lease.total} 份租约在管
          </p>
        </div>
        <Button icon={<RefreshCw size={15} />} onClick={load} loading={loading}>
          刷新数据
        </Button>
      </div>

      {/* 核心指标 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="本月应收"
          value={moneyCompact(finance.month_payable)}
          suffix="元"
          hint={`本月账单应收合计 · 装修抵扣 ${moneyCompact(finance.month_deduction)} 元`}
          extra={<TrendingUp size={16} className="text-[#C7C7CC]" />}
        />
        <KpiCard
          label="本月实收"
          value={moneyCompact(finance.month_paid)}
          suffix="元"
          hint={
            finance.month_payable > 0
              ? `收缴率 ${((finance.month_paid / finance.month_payable) * 100).toFixed(1)}%`
              : '本月暂无应收账单'
          }
          extra={<TrendingUp size={16} className="text-[#C7C7CC]" />}
        />
        <KpiCard
          label="整体出租率"
          value={property.overall_rate}
          suffix="%"
          hint={`厂房 ${property.factory.rate}% · 公寓 ${property.apartment.rate}%`}
          extra={<TrendingUp size={16} className="text-[#C7C7CC]" />}
        />
        <KpiCard
          label="累计装修抵扣"
          value={moneyCompact(finance.total_deduction)}
          suffix="元"
          hint="已按抵扣期数冲减的租金总额"
          extra={<TrendingUp size={16} className="text-[#C7C7CC]" />}
        />
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <ChartCard
          title="收支趋势"
          subtitle="近 12 个月应收与实收对比"
          extra={
            <div className="flex items-center gap-4 text-[12px] text-[#6E6E73]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#1D1D1F]" />
                应收
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0066CC]" />
                实收
              </span>
            </div>
          }
        >
          {trend.length > 0 ? (
            <TrendChart data={trend} />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-[#AEAEB2]">
              暂无账单数据
            </div>
          )}
        </ChartCard>

        <ChartCard title="房源出租率" subtitle="按业态拆分">
          <div className="grid h-full grid-cols-2 gap-4">
            <OccupancyDonut
              label="厂房"
              rented={property.factory.rented}
              vacant={property.factory.vacant}
            />
            <OccupancyDonut
              label="公寓"
              rented={property.apartment.rented}
              vacant={property.apartment.vacant}
            />
          </div>
        </ChartCard>
      </div>

      {/* 预警区 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <PageCard>
          <SectionTitle
            title="租约到期预警"
            subtitle={`提前 ${data.warn_days} 天提醒，共 ${warnings.expiring_leases.length} 份`}
            extra={
              <Link
                to="/leases?status=expiring"
                className="flex items-center gap-1 text-[12.5px] text-[#0066CC] hover:underline"
              >
                查看全部 <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="mt-5 space-y-1">
            {warnings.expiring_leases.length === 0 && (
              <p className="py-8 text-center text-[13px] text-[#AEAEB2]">暂无临近到期的租约</p>
            )}
            {warnings.expiring_leases.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/leases/${item.id}`)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-black/[0.03]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CalendarClock size={16} className="shrink-0 text-[#C77700]" />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-[#1D1D1F]">
                      {item.tenant_name}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[#86868B]">
                      {item.lease_no} · {item.property_type === 'factory' ? '厂房' : '公寓'} ·{' '}
                      {dateText(item.end_date)} 到期
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-[rgba(199,119,0,0.11)] px-2 py-1 text-[11.5px] font-medium text-[#C77700]">
                  {item.days_left <= 0 ? '今日到期' : `剩 ${item.days_left} 天`}
                </span>
              </button>
            ))}
          </div>
        </PageCard>

        <PageCard>
          <SectionTitle
            title="逾期欠费预警"
            subtitle={`共 ${finance.arrears_count} 笔，合计 ${moneyCompact(finance.arrears_amount)} 元`}
            extra={
              <Link
                to="/finance/bills?status=unpaid"
                className="flex items-center gap-1 text-[12.5px] text-[#0066CC] hover:underline"
              >
                查看欠费明细 <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="mt-5 space-y-1">
            {warnings.overdue_bills.length === 0 && (
              <p className="py-8 text-center text-[13px] text-[#AEAEB2]">暂无逾期账单</p>
            )}
            {warnings.overdue_bills.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-black/[0.03]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AlertTriangle size={16} className="shrink-0 text-[#D70015]" />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-[#1D1D1F]">
                      {item.tenant_name}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[#86868B]">
                      {item.bill_no} · 应交 {dateText(item.due_date)} · 逾期 {item.overdue_days} 天
                    </p>
                  </div>
                </div>
                <MoneyText value={item.outstanding} tone="danger" strong className="shrink-0 text-[13.5px]" />
              </div>
            ))}
          </div>
        </PageCard>
      </div>

      {/* 运营与公告 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <PageCard>
          <SectionTitle title="本月运营" subtitle="业务动作统计" />
          <div className="mt-5 grid grid-cols-3 gap-4">
            <div className="rounded-2xl bg-black/[0.025] px-4 py-5 text-center">
              <p className="text-[24px] font-semibold leading-7 tabular-nums text-[#1D1D1F]">
                {numberText(operation.signed_this_month)}
              </p>
              <p className="mt-1.5 text-[12px] text-[#86868B]">新增签约</p>
            </div>
            <div className="rounded-2xl bg-black/[0.025] px-4 py-5 text-center">
              <p className="text-[24px] font-semibold leading-7 tabular-nums text-[#1D1D1F]">
                {numberText(operation.viewings_this_month)}
              </p>
              <p className="mt-1.5 text-[12px] text-[#86868B]">看房预约</p>
            </div>
            <div className="rounded-2xl bg-black/[0.025] px-4 py-5 text-center">
              <p className="text-[24px] font-semibold leading-7 tabular-nums text-[#1D1D1F]">
                {numberText(operation.work_orders_open)}
              </p>
              <p className="mt-1.5 text-[12px] text-[#86868B]">待处理工单</p>
            </div>
          </div>

          <div className="mt-6 space-y-2.5">
            <p className="text-[12px] font-medium text-[#86868B]">房源明细</p>
            {[
              {
                label: '厂房',
                total: property.factory.total,
                rented: property.factory.rented,
                vacant: property.factory.vacant,
                other: property.factory.disabled,
                otherLabel: '停用',
              },
              {
                label: '公寓',
                total: property.apartment.total,
                rented: property.apartment.rented,
                vacant: property.apartment.vacant,
                other: property.apartment.repair,
                otherLabel: '待维修',
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-[13px]">
                <span className="text-[#6E6E73]">{row.label}</span>
                <span className="flex items-center gap-5 tabular-nums text-[#1D1D1F]">
                  <span>共 {row.total}</span>
                  <span className="text-[#1D9A4E]">已租 {row.rented}</span>
                  <span className="text-[#86868B]">空置 {row.vacant}</span>
                  {row.other > 0 && <span className="text-[#C77700]">{row.otherLabel} {row.other}</span>}
                </span>
              </div>
            ))}
          </div>
        </PageCard>

        <PageCard>
          <SectionTitle
            title="最新公告"
            subtitle="停水停电、安全整改与租赁规则通知"
            extra={
              <Link
                to="/notifications"
                className="flex items-center gap-1 text-[12.5px] text-[#0066CC] hover:underline"
              >
                全部公告 <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="mt-5 space-y-1">
            {announcements.length === 0 && (
              <p className="py-8 text-center text-[13px] text-[#AEAEB2]">暂无公告</p>
            )}
            {announcements.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-black/[0.03]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {item.is_top === 1 && (
                    <span className="shrink-0 rounded-md bg-[rgba(215,0,21,0.09)] px-1.5 py-[2px] text-[10.5px] font-medium text-[#D70015]">
                      置顶
                    </span>
                  )}
                  <span className="truncate text-[13.5px] text-[#1D1D1F]">{item.title}</span>
                </div>
                <span className="shrink-0 text-[12px] text-[#AEAEB2]">{dateText(item.created_at)}</span>
              </div>
            ))}
          </div>
        </PageCard>
      </div>

      {/* 业态收入分布 */}
      {data.by_type.length > 0 && (
        <PageCard>
          <SectionTitle title="业态收入分布" subtitle="厂房与公寓独立核算" />
          <div className="mt-5 grid grid-cols-2 gap-4">
            {data.by_type.map((item) => (
              <div key={item.property_type} className="rounded-2xl bg-black/[0.025] px-5 py-4">
                <p className="text-[12.5px] text-[#86868B]">{item.type_label}累计应收</p>
                <p className="mt-1.5 text-[22px] font-semibold leading-7 tabular-nums text-[#1D1D1F]">
                  {moneyCompact(item.payable)}
                  <span className="ml-1 text-[12px] font-normal text-[#86868B]">元</span>
                </p>
                <p className="mt-1.5 text-[12px] text-[#86868B]">
                  实收 {moneyCompact(item.paid)} 元 · 收缴率{' '}
                  {item.payable > 0 ? ((item.paid / item.payable) * 100).toFixed(1) : '0.0'}%
                </p>
              </div>
            ))}
          </div>
        </PageCard>
      )}

      {/* 账单状态分布，作为状态色的图例说明 */}
      <PageCard>
        <SectionTitle title="账单状态口径" subtitle="全站统一的四种状态与判定规则" />
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              ['pending', '待收款', '未过应交日期且未收款'],
              ['partial', '部分收款', '已收金额小于应收金额'],
              ['overdue', '逾期欠费', '已过应交日期且未收款'],
              ['paid', '已收款', '实收已达应收金额'],
            ] as const
          ).map(([key, label, desc]) => (
            <div key={key} className="rounded-2xl border border-black/[0.06] px-4 py-3.5">
              <p className="text-[13px] font-medium text-[#1D1D1F]">{label}</p>
              <p className="mt-1 text-[11.5px] leading-5 text-[#86868B]">{desc}</p>
              <p className="mt-1 text-[11px] text-[#C7C7CC]">{BILL_STATUS[key].tone}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] text-[#AEAEB2]">
          当前统计区间：{periodText(data.today, data.today)} · 数据实时来自账单台账
        </p>
      </PageCard>
    </div>
  )
}
