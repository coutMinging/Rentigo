import { cn } from '../utils/cn'
import { TONE_COLOR, type StatusMeta } from '../utils/constants'

type Tone = StatusMeta['tone']

const TONE_BG: Record<Tone, string> = {
  default: 'rgba(0,0,0,0.05)',
  success: 'rgba(29,154,78,0.10)',
  warning: 'rgba(199,119,0,0.11)',
  danger: 'rgba(215,0,21,0.09)',
  processing: 'rgba(0,102,204,0.09)',
  purple: 'rgba(124,92,255,0.10)',
}

/**
 * 状态标签：圆点 + 文字 + 低饱和底色。
 * 全站状态色语义统一（空置灰 / 已租绿 / 逾期红），
 * 颜色由 constants.ts 的字典统一提供，避免各页面各写一套。
 */
export function StatusTag({
  meta,
  className,
  showDot = true,
}: {
  meta?: StatusMeta
  className?: string
  showDot?: boolean
}) {
  if (!meta) return <span className="text-[#AEAEB2]">—</span>

  const color = TONE_COLOR[meta.tone]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2 py-[3px] text-[12px] font-medium leading-4',
        className,
      )}
      style={{ background: TONE_BG[meta.tone], color }}
    >
      {showDot && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      )}
      {meta.label}
    </span>
  )
}

/** 紧凑色点，用于表格里极窄的一列 */
export function StatusDot({ meta }: { meta?: StatusMeta }) {
  if (!meta) return null
  return (
    <span className="inline-flex items-center gap-2 text-[13px]">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: TONE_COLOR[meta.tone] }}
      />
      {meta.label}
    </span>
  )
}

/** 普通的灰色标签，用于展示不计入状态语义的文本（如"有行车""可环评"） */
export function PlainTag({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg bg-black/[0.045] px-2 py-[3px] text-[12px] leading-4 text-[#6E6E73]',
        className,
      )}
    >
      {children}
    </span>
  )
}
