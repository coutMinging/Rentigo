import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { moneyCompact } from '../../utils/format'

const AXIS_STYLE = { fontSize: 12, fill: '#86868B' }

/** 收支趋势：应收与实收双线面积图 */
export function TrendChart({
  data,
}: {
  data: Array<{ bucket: string; payable: number; paid: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="payableFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D1D1F" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#1D1D1F" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="paidFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0066CC" stopOpacity={0.16} />
            <stop offset="100%" stopColor="#0066CC" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
        <XAxis
          dataKey="bucket"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          width={64}
          tickFormatter={(v: number) => moneyCompact(v)}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            fontSize: 12,
          }}
          formatter={(value: number, name: string) => [
            `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
            name,
          ]}
          labelFormatter={(label: string) => `账期 ${label}`}
        />
        <Area
          type="monotone"
          dataKey="payable"
          name="应收"
          stroke="#1D1D1F"
          strokeWidth={2}
          fill="url(#payableFill)"
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Area
          type="monotone"
          dataKey="paid"
          name="实收"
          stroke="#0066CC"
          strokeWidth={2}
          fill="url(#paidFill)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** 出租率环形图 */
export function OccupancyDonut({
  rented,
  vacant,
  label,
}: {
  rented: number
  vacant: number
  label: string
}) {
  const total = rented + vacant
  const rate = total > 0 ? Math.round((rented / total) * 1000) / 10 : 0
  const data = [
    { name: '已出租', value: rented, color: '#1D1D1F' },
    { name: '空置可租', value: vacant, color: 'rgba(0,0,0,0.07)' },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="68%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
              paddingAngle={total > 0 && vacant > 0 ? 2 : 0}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [`${value} 间`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-semibold leading-8 tracking-tight tabular-nums text-[#1D1D1F]">
            {rate}%
          </span>
          <span className="text-[12px] text-[#86868B]">{label}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-5 text-[12px]">
        <span className="flex items-center gap-1.5 text-[#6E6E73]">
          <span className="h-2 w-2 rounded-full bg-[#1D1D1F]" />
          已租 {rented}
        </span>
        <span className="flex items-center gap-1.5 text-[#6E6E73]">
          <span className="h-2 w-2 rounded-full bg-black/[0.12]" />
          空置 {vacant}
        </span>
      </div>
    </div>
  )
}
