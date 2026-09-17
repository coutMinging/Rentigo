import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { money, moneyCompact } from '../utils/format'

/** 金额展示：右对齐等宽数字，主色调 */
export function MoneyText({
  value,
  className,
  compact,
  strong,
  tone = 'default',
}: {
  value: unknown
  className?: string
  compact?: boolean
  strong?: boolean
  tone?: 'default' | 'success' | 'danger' | 'muted'
}) {
  const colorMap = {
    default: 'text-[#1D1D1F]',
    success: 'text-[#1D9A4E]',
    danger: 'text-[#D70015]',
    muted: 'text-[#86868B]',
  }

  return (
    <span
      className={cn(
        'tabular-nums',
        strong && 'font-semibold',
        colorMap[tone],
        className,
      )}
    >
      {compact ? moneyCompact(value) : money(value)}
    </span>
  )
}

/** 大号指标数字，用于看板 */
export function MetricValue({
  value,
  suffix,
  className,
}: {
  value: ReactNode
  suffix?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline gap-1', className)}>
      <span className="text-[30px] font-semibold leading-9 tracking-tight tabular-nums text-[#1D1D1F]">
        {value}
      </span>
      {suffix && <span className="text-[13px] text-[#86868B]">{suffix}</span>}
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: ReactNode
  suffix?: string
  hint?: string
  /** 次要指标，右侧小字展示 */
  extra?: ReactNode
  onClick?: () => void
  className?: string
}

/**
 * 看板指标卡：纯白底 + 发丝线，悬停轻微抬升。
 * 刻意不用彩色渐变，保持苹果官网那种克制的白。
 */
export function KpiCard({
  label,
  value,
  suffix,
  hint,
  extra,
  onClick,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'surface surface-hover p-5',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between">
        <p className="text-[13px] leading-5 text-[#86868B]">{label}</p>
        {extra}
      </div>
      <MetricValue value={value} suffix={suffix} className="mt-3" />
      {hint && <p className="mt-2 text-[12px] leading-4 text-[#AEAEB2]">{hint}</p>}
    </div>
  )
}

/** 图表容器：标题 + 固定高度内容区 */
export function ChartCard({
  title,
  subtitle,
  extra,
  height = 280,
  children,
  className,
}: {
  title: string
  subtitle?: string
  extra?: ReactNode
  height?: number
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('surface p-6', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold leading-6 text-[#1D1D1F]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-[#86868B]">{subtitle}</p>}
        </div>
        {extra}
      </div>
      <div className="mt-5" style={{ height }}>
        {children}
      </div>
    </div>
  )
}

/** 进度条：用于出租率等比例展示 */
export function ProgressBar({
  percent: value,
  tone = 'default',
  className,
}: {
  percent: number
  tone?: 'default' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const colorMap = {
    default: '#1D1D1F',
    success: '#1D9A4E',
    warning: '#C77700',
    danger: '#D70015',
  }
  const clamped = Math.max(0, Math.min(100, Number(value) || 0))

  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]', className)}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, background: colorMap[tone] }}
      />
    </div>
  )
}
