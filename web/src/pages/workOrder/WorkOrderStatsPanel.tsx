import { Segmented, Table } from 'antd'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard, KpiCard, MoneyText } from '../../components/DataDisplay'
import { EmptyHint, PageCard, SectionTitle } from '../../components/Surface'
import { PROPERTY_TYPE } from '../../utils/constants'
import { money, moneyCompact, numberText } from '../../utils/format'
import type { WorkOrderPropertyStat, WorkOrderStats, WorkOrderStatus } from '../../types'

const AXIS_STYLE = { fontSize: 12, fill: '#86868B' }

/** 可点击筛选列表的状态指标卡 */
const STATUS_CARDS: Array<{ status: WorkOrderStatus; label: string; hint: string }> = [
  { status: 'pending', label: '待派单', hint: '已受理，等待指派维修人员' },
  { status: 'repairing', label: '维修中', hint: '已派单，正在处理' },
  { status: 'done', label: '已完工', hint: '维修完成，待关闭归档' },
  { status: 'closed', label: '已关闭', hint: '已归档的历史工单' },
]

type PropertyTypeFilter = '' | 'factory' | 'apartment'

interface Props {
  stats?: WorkOrderStats
  propertyStats: WorkOrderPropertyStat[]
  loading: boolean
  propertyType: PropertyTypeFilter
  onPropertyTypeChange: (value: PropertyTypeFilter) => void
  activeStatus: WorkOrderStatus | ''
  onStatusClick: (status: WorkOrderStatus | '') => void
}

/**
 * 页头统计区：状态指标卡 + 按房源的维修频次与成本。
 * 指标卡点击即筛选列表，点击已选中的卡片可取消筛选。
 */
export default function WorkOrderStatsPanel({
  stats,
  propertyStats,
  loading,
  propertyType,
  onPropertyTypeChange,
  activeStatus,
  onStatusClick,
}: Props) {
  const chartRows = [...propertyStats]
    .filter((item) => item.total_cost > 0)
    .sort((a, b) => b.total_cost - a.total_cost)
    .slice(0, 6)

  const chartData = chartRows.map((item) => ({
    label: item.property_name
      ? `${PROPERTY_TYPE[item.property_type]} · ${item.property_name}`
      : `${PROPERTY_TYPE[item.property_type]} · 未关联房源`,
    total_cost: item.total_cost,
    order_count: item.order_count,
  }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {STATUS_CARDS.map((item) => {
          const active = activeStatus === item.status
          return (
            <KpiCard
              key={item.status}
              label={item.label}
              value={numberText(stats?.[item.status] ?? 0)}
              hint={active ? '再次点击取消筛选' : item.hint}
              onClick={() => onStatusClick(active ? '' : item.status)}
              className={active ? 'ring-1 ring-[#1D1D1F]' : undefined}
            />
          )
        })}
        <KpiCard
          label="累计维修费用"
          value={money(stats?.total_cost ?? 0)}
          suffix="元"
          hint="全部筛选范围内的维修支出"
        />
        <KpiCard
          label="本月新增"
          value={numberText(stats?.month_new ?? 0)}
          suffix="单"
          hint="本月受理的报修工单"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <ChartCard
          className="xl:col-span-3"
          title="维修成本 Top 房源"
          subtitle="按累计维修费用排序，取前 6 个房源"
          extra={
            <Segmented
              size="small"
              value={propertyType || 'all'}
              onChange={(v) => onPropertyTypeChange(v === 'all' ? '' : (v as PropertyTypeFilter))}
              options={[
                { value: 'all', label: '全部' },
                { value: 'factory', label: '厂房' },
                { value: 'apartment', label: '公寓' },
              ]}
            />
          }
          height={300}
        >
          {chartData.length === 0 ? (
            <EmptyHint
              title="暂无维修费用"
              description="产生维修费用后，这里会按房源统计维修成本排行"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={AXIS_STYLE}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => moneyCompact(v)}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={AXIS_STYLE}
                  axisLine={false}
                  tickLine={false}
                  width={168}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid rgba(0,0,0,0.08)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`¥${money(value)}`, '维修成本']}
                />
                <Bar dataKey="total_cost" name="维修成本" fill="#0066CC" radius={[0, 6, 6, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <PageCard className="xl:col-span-2" flush>
          <div className="px-6 pt-5">
            <SectionTitle
              title="按房源维修明细"
              subtitle="维修频次、未完工数与累计维修成本"
            />
          </div>
          <div className="mt-4">
            <Table
              rowKey={(record) => `${record.property_type}-${record.property_id ?? 'none'}`}
              size="small"
              loading={loading}
              dataSource={propertyStats}
              pagination={false}
              scroll={{ y: 236, x: 520 }}
              locale={{
                emptyText: (
                  <EmptyHint title="暂无维修记录" description="工单关联房源后，这里会按房源汇总" />
                ),
              }}
              columns={[
                {
                  title: '房源',
                  key: 'property',
                  width: 200,
                  render: (_v, record) => (
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-[#1D1D1F]">
                        {record.property_name ?? '未关联房源'}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-[#AEAEB2]">
                        {PROPERTY_TYPE[record.property_type]}
                      </p>
                    </div>
                  ),
                },
                {
                  title: '维修次数',
                  dataIndex: 'order_count',
                  width: 90,
                  align: 'right',
                  render: (v: number) => <span className="tabular-nums text-[13px]">{v}</span>,
                },
                {
                  title: '未完工',
                  dataIndex: 'open_count',
                  width: 80,
                  align: 'right',
                  render: (v: number) =>
                    v > 0 ? (
                      <span className="tabular-nums text-[13px] font-medium text-[#C77700]">{v}</span>
                    ) : (
                      <span className="text-[13px] text-[#D2D2D7]">—</span>
                    ),
                },
                {
                  title: '累计费用',
                  dataIndex: 'total_cost',
                  width: 120,
                  align: 'right',
                  render: (v: number) => <MoneyText value={v} strong className="text-[13px]" />,
                },
              ]}
            />
          </div>
        </PageCard>
      </div>
    </div>
  )
}
