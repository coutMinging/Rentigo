import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

interface PageCardProps {
  children: ReactNode
  className?: string
  /** 是否启用悬停抬升效果 */
  hoverable?: boolean
  /** 去掉内边距（表格类卡片常用） */
  flush?: boolean
}

/**
 * 纯白卡片容器。
 * 全站统一用它承载内容，靠发丝线与极轻阴影分层，不使用色块。
 */
export function PageCard({ children, className, hoverable, flush }: PageCardProps) {
  return (
    <div
      className={cn(
        'surface',
        hoverable && 'surface-hover',
        !flush && 'p-6',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface SectionTitleProps {
  title: string
  subtitle?: string
  extra?: ReactNode
  className?: string
}

/** 区块标题：标题 + 可选副标题 + 右侧操作区 */
export function SectionTitle({ title, subtitle, extra, className }: SectionTitleProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold leading-6 text-[#1D1D1F]">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] leading-5 text-[#86868B]">{subtitle}</p>}
      </div>
      {extra && <div className="flex shrink-0 items-center gap-2">{extra}</div>}
    </div>
  )
}

interface EmptyHintProps {
  title?: string
  description?: string
  action?: ReactNode
}

/** 空状态提示，比 antd 默认 Empty 更克制 */
export function EmptyHint({
  title = '暂无数据',
  description = '当前条件下没有匹配的记录',
  action,
}: EmptyHintProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 h-12 w-12 rounded-2xl border border-dashed border-black/10" />
      <p className="text-[15px] font-medium text-[#1D1D1F]">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-5 text-[#86868B]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** 键值对展示，用于详情抽屉里的信息罗列 */
export function FieldList({
  items,
  columns = 2,
}: {
  items: Array<{ label: string; value: ReactNode; span?: number }>
  columns?: number
}) {
  return (
    <div
      className={cn('grid gap-x-8 gap-y-4', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}
    >
      {items.map((item) => (
        <div key={item.label} className={cn('min-w-0', item.span === 2 && 'col-span-2')}>
          <p className="text-[12px] leading-4 text-[#86868B]">{item.label}</p>
          <div className="mt-1 break-words text-[14px] leading-5 text-[#1D1D1F]">
            {item.value ?? '—'}
          </div>
        </div>
      ))}
    </div>
  )
}
