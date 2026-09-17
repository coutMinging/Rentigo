import {
  BarChart3,
  Building2,
  CalendarCheck,
  FileText,
  Home,
  Megaphone,
  Settings,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import type { ComponentType } from 'react'

export interface MenuItem {
  key: string
  path: string
  label: string
  icon: ComponentType<{ size?: number | string; className?: string }>
  /** 需要的模块权限，用于按角色隐藏菜单 */
  module?: string
  /** 占位模块：功能未实现，菜单置灰 */
  placeholder?: boolean
  description?: string
}

export interface MenuGroup {
  key: string
  label: string
  items: MenuItem[]
}

/**
 * 菜单配置。
 * 「占位模块」本期只提供框架页，菜单上标注"待建设"，避免用户误以为功能缺失。
 */
export const MENU_GROUPS: MenuGroup[] = [
  {
    key: 'overview',
    label: '概览',
    items: [
      {
        key: 'dashboard',
        path: '/dashboard',
        label: '数据统计看板',
        icon: Home,
        module: 'dashboard',
        description: '出租率、收支与预警一屏掌握',
      },
    ],
  },
  {
    key: 'business',
    label: '租赁业务',
    items: [
      { key: 'factories', path: '/property/factories', label: '厂房房源', icon: Building2, module: 'property' },
      { key: 'apartments', path: '/property/apartments', label: '公寓房源', icon: Building2, module: 'property' },
      { key: 'tenants', path: '/tenants', label: '租客管理', icon: Users, module: 'tenant' },
      { key: 'leases', path: '/leases', label: '租约合同', icon: FileText, module: 'lease' },
      { key: 'viewings', path: '/viewings', label: '看房预约', icon: CalendarCheck, module: 'viewing', description: '预约登记与跟进记录' },
    ],
  },
  {
    key: 'finance',
    label: '财务与运维',
    items: [
      { key: 'bills', path: '/finance/bills', label: '账单台账', icon: Wallet, module: 'bill' },
      { key: 'reports', path: '/finance/reports', label: '财务报表', icon: BarChart3, module: 'bill' },
      { key: 'work-orders', path: '/work-orders', label: '报修工单', icon: Wrench, module: 'workOrder', description: '派单、维修进度与成本统计' },
    ],
  },
  {
    key: 'system',
    label: '系统',
    items: [
      { key: 'notifications', path: '/notifications', label: '消息与公告', icon: Megaphone, module: 'system' },
      { key: 'settings', path: '/settings', label: '系统设置', icon: Settings, module: 'system' },
    ],
  },
]

/** 面包屑与页面标题用的路径映射 */
export const PATH_LABEL: Record<string, string> = Object.fromEntries(
  MENU_GROUPS.flatMap((group) => group.items.map((item) => [item.path, item.label])),
)
