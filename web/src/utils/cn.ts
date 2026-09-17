import { twMerge } from 'tailwind-merge'

/**
 * 合并 Tailwind 类名。
 * 后面的类会覆盖前面冲突的类（如 p-2 与 p-4 只保留 p-4），
 * 避免组件外部传入 className 时出现样式冲突。
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return twMerge(inputs.filter(Boolean).join(' '))
}
