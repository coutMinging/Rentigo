import { cn } from '../utils/cn'

/**
 * Rentigo 品牌标识。
 *
 * 命名拆解：Rent（租赁）+ go（向前），标识需要同时承载「房产」与「动势」。
 *
 * 字形构造：
 *   1. 竖笔 + 规则半圆碗部 —— 构成一道拱门，对应厂房与公寓的入口
 *   2. 斜腿自碗部右下出发，穿过字面伸向底板右下角 —— 用走向而非箭头表达 go，
 *      保证 16px 下依然干净（加箭头会在小尺寸与斜腿粘连）
 *   3. 笔画统一圆头圆角 —— 拱门是柔和的，避免工业感的锐角
 *
 * 比例依据：碗部高度取字高的 61.9%（接近经典 R 的 60%），斜腿严格 45°，
 * 笔画强度约为字高的 17.6%——再粗会糊住碗部的内孔，再细则 16px 下会断。
 * 字形占底板约 46% × 57%，四周留白按光学重心配平。
 * 与 public/favicon.svg 完全一致，修改时多处需同步。
 */
const GLYPH = {
  strokeWidth: 4.86,
  /** 竖笔：拱门左墙体 */
  stem: 'M15.47 12.12V33.07',
  /** 碗部：半径 6.48 的规则半圆，即拱门本体 */
  bowl: 'M15.47 12.12h7.45a6.48 6.48 0 0 1 0 12.96h-7.45',
  /** 斜腿：自碗部右下角以 45° 冲出，略过基线，形成向前的势 */
  leg: 'M22.92 25.08L32.64 34.8',
} as const

export type LogoVariant = 'dark' | 'light' | 'bare'

export interface LogoProps {
  /** 渲染边长（px） */
  size?: number
  /**
   * dark  —— 墨黑底 + 白色字形（默认，用于浅色界面）
   * light —— 白底 + 墨黑字形（用于深色界面）
   * bare  —— 无底板，继承 currentColor（单色场景）
   */
  variant?: LogoVariant
  className?: string
}

/** 标识图形本体（不含文字） */
export function LogoMark({ size = 32, variant = 'dark', className }: LogoProps) {
  const isBare = variant === 'bare'
  const stroke = isBare ? 'currentColor' : variant === 'dark' ? '#FFFFFF' : '#1D1D1F'
  const plate = variant === 'dark' ? '#1D1D1F' : '#FFFFFF'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Rentigo"
      className={cn('block shrink-0', className)}
    >
      {!isBare && (
        <>
          <rect width="48" height="48" rx="13.5" fill={plate} />
          {/* 白底需要一条发丝线，否则在纯白页面上边界会消失 */}
          {variant === 'light' && (
            <rect
              x="0.5"
              y="0.5"
              width="47"
              height="47"
              rx="13"
              fill="none"
              stroke="rgba(0,0,0,0.08)"
            />
          )}
        </>
      )}
      <g
        fill="none"
        stroke={stroke}
        strokeWidth={GLYPH.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={GLYPH.stem} />
        <path d={GLYPH.bowl} />
        <path d={GLYPH.leg} />
      </g>
    </svg>
  )
}

export interface BrandProps extends LogoProps {
  /** 标识右侧的副标题，不传则用「租赁管理系统」 */
  subtitle?: string
  /** 仅保留标识图形、不显示文字（侧边栏收起时用） */
  markOnly?: boolean
  /** 附加在文字容器上的类名，用于控制截断等 */
  textClassName?: string
  /**
   * 置于深色背景之上：文字翻白、标识自动换成白底板。
   * 默认 false，即"浅色背景"，侧边栏与顶栏沿用原有观感。
   */
  onDark?: boolean
}

/** 标识 + 名称的组合，侧边栏与登录页统一使用，保证品牌呈现一致 */
export function Brand({
  size = 32,
  variant,
  subtitle,
  markOnly = false,
  className,
  textClassName,
  onDark = false,
}: BrandProps) {
  // 深色底上墨黑底板会融进背景，必须换成白底板；显式传入 variant 时以调用方为准
  const markVariant: LogoVariant = variant ?? (onDark ? 'light' : 'dark')

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={size} variant={markVariant} />
      {!markOnly && (
        <div className={cn('min-w-0', textClassName)}>
          <p
            className={cn(
              'truncate font-semibold tracking-[-0.01em]',
              onDark ? 'text-white' : 'text-[#1D1D1F]',
              size < 36 ? 'text-[15px] leading-[18px]' : 'text-[17px] leading-[21px]',
            )}
          >
            Rentigo
          </p>
          <p
            className={cn(
              'truncate',
              onDark ? 'text-white/45' : 'text-[#86868B]',
              size < 36 ? 'text-[11.5px] leading-[16px]' : 'text-[12.5px] leading-[17px]',
            )}
          >
            {subtitle ?? '租赁管理系统'}
          </p>
        </div>
      )}
    </div>
  )
}
