import { useCallback, useEffect, useState } from 'react'
import { Button, DatePicker, Segmented, Skeleton, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download } from 'lucide-react'
import { billApi } from '../../api/bill'
import { ChartCard, KpiCard, MoneyText } from '../../components/DataDisplay'
import { PageCard, SectionTitle } from '../../components/Surface'
import { usePermission } from '../../hooks'
import { money, moneyCompact } from '../../utils/format'
import type { ReportData, ReportSeriesItem } from '../../types'

export default function ReportsPage() {
  const can = usePermission()
  const [granularity, setGranularity] = useState<'month' | 'year'>('month')
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('year'),
    dayjs(),
  ])
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const params = useCallback(
    () => ({
      granularity,
      start_date: range[0].format('YYYY-MM-DD'),
      end_date: range[1].format('YYYY-MM-DD'),
    }),
    [granularity, range],
  )

  const load = useCallback(() => {
    setLoading(true)
    billApi
      .reports(params())
      .then(setData)
      .catch((err) => console.error('[report] 加载失败:', err))
      .finally(() => setLoading(false))
  }, [params])

  useEffect(() => {
    load()
  }, [load])

  const handleExport = async () => {
    setExporting(true)
    try {
      await billApi.exportReport(params())
    } catch (err) {
      console.error('[report] 导出失败:', err)
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<ReportSeriesItem> = [
    {
      title: granularity === 'year' ? '年度' : '月份',
      dataIndex: 'bucket',
      width: 110,
      fixed: 'left',
    },
    {
      title: '厂房应收',
      dataIndex: 'factory_payable',
      align: 'right',
      render: (v: number) => <MoneyText value={v} />,
    },
    {
      title: '厂房实收',
      dataIndex: 'factory_paid',
      align: 'right',
      render: (v: number) => <MoneyText value={v} tone="success" />,
    },
    {
      title: '厂房抵扣',
      dataIndex: 'factory_deduction',
      align: 'right',
      render: (v: number) => <MoneyText value={v} tone="muted" />,
    },
    {
      title: '公寓应收',
      dataIndex: 'apartment_payable',
      align: 'right',
      render: (v: number) => <MoneyText value={v} />,
    },
    {
      title: '公寓实收',
      dataIndex: 'apartment_paid',
      align: 'right',
      render: (v: number) => <MoneyText value={v} tone="success" />,
    },
    {
      title: '公寓抵扣',
      dataIndex: 'apartment_deduction',
      align: 'right',
      render: (v: number) => <MoneyText value={v} tone="muted" />,
    },
    {
      title: '欠费',
      dataIndex: 'outstanding',
      align: 'right',
      render: (v: number) =>
        v > 0 ? <MoneyText value={v} tone="danger" strong /> : <span className="text-[#AEAEB2]">—</span>,
    },
  ]

  const total = data?.total ?? {}

  return (
    <div className="space-y-5">
      {/* 筛选 */}
      <PageCard>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-1.5 text-[12px] text-[#86868B]">统计粒度</p>
            <Segmented
              value={granularity}
              onChange={(v) => setGranularity(v as 'month' | 'year')}
              options={[
                { value: 'month', label: '按月' },
                { value: 'year', label: '按年' },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[12px] text-[#86868B]">账期区间</p>
            <DatePicker.RangePicker
              format="YYYY-MM-DD"
              value={range}
              onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])}
            />
          </div>
          <div className="ml-auto">
            {can('bill', 'export') && (
              <Button icon={<Download size={15} />} onClick={handleExport} loading={exporting}>
                导出报表
              </Button>
            )}
          </div>
        </div>
      </PageCard>

      {/* 业态分离汇总 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="厂房应收"
          value={moneyCompact(total.factory_payable ?? 0)}
          suffix="元"
          hint={`实收 ${moneyCompact(total.factory_paid ?? 0)} 元`}
        />
        <KpiCard
          label="公寓应收"
          value={moneyCompact(total.apartment_payable ?? 0)}
          suffix="元"
          hint={`实收 ${moneyCompact(total.apartment_paid ?? 0)} 元`}
        />
        <KpiCard
          label="装修抵扣合计"
          value={moneyCompact(total.deduction ?? 0)}
          suffix="元"
          hint={`厂房 ${moneyCompact(total.factory_deduction ?? 0)} · 公寓 ${moneyCompact(total.apartment_deduction ?? 0)}`}
        />
        <KpiCard
          label="欠费合计"
          value={moneyCompact(total.outstanding ?? 0)}
          suffix="元"
          hint="区间内未结清金额"
        />
      </div>

      {/* 图表 */}
      <ChartCard
        title="应收 / 实收 / 抵扣趋势"
        subtitle={`${granularity === 'year' ? '按年' : '按月'}对比，厂房与公寓合并口径`}
        extra={
          <span className="text-[12px] text-[#86868B]">
            收缴率{' '}
            {Number(total.payable) > 0
              ? (((Number(total.paid) || 0) / Number(total.payable)) * 100).toFixed(1)
              : '0.0'}
            %
          </span>
        }
      >
        {loading && !data ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data?.series ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: '#86868B' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 12, fill: '#86868B' }}
                axisLine={false}
                tickLine={false}
                width={70}
                tickFormatter={(v: number) => moneyCompact(v)}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.08)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [`¥${money(value)}`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="payable" name="应收" fill="rgba(29,29,31,0.85)" radius={[6, 6, 0, 0]} barSize={22} />
              <Bar dataKey="paid" name="实收" fill="rgba(0,102,204,0.55)" radius={[6, 6, 0, 0]} barSize={22} />
              <Line
                type="monotone"
                dataKey="deduction"
                name="装修抵扣"
                stroke="#7C5CFF"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 明细 */}
      <PageCard flush>
        <div className="px-6 py-5">
          <SectionTitle
            title="业态分离明细"
            subtitle="厂房与公寓独立核算，可直接用于财务对账与记账"
          />
        </div>
        <Table
          rowKey="bucket"
          size="middle"
          columns={columns}
          dataSource={data?.series ?? []}
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={false}
          summary={(rows) =>
            rows.length > 0 ? (
              <Table.Summary.Row className="bg-black/[0.02] font-medium">
                <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <MoneyText value={rows.reduce((s, r) => s + r.factory_payable, 0)} strong />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <MoneyText value={rows.reduce((s, r) => s + r.factory_paid, 0)} tone="success" strong />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <MoneyText value={rows.reduce((s, r) => s + r.factory_deduction, 0)} tone="muted" />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <MoneyText value={rows.reduce((s, r) => s + r.apartment_payable, 0)} strong />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <MoneyText value={rows.reduce((s, r) => s + r.apartment_paid, 0)} tone="success" strong />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  <MoneyText value={rows.reduce((s, r) => s + r.apartment_deduction, 0)} tone="muted" />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">
                  <MoneyText value={rows.reduce((s, r) => s + r.outstanding, 0)} tone="danger" strong />
                </Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null
          }
        />
      </PageCard>

      <p className="text-[12px] text-[#AEAEB2]">
        统计口径：按账单「账期开始日」归属到对应月份或年度，金额取账单当前应收与实收快照。
      </p>
    </div>
  )
}
