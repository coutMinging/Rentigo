import { useEffect, useMemo, useState } from 'react'
import { Avatar, Badge, Dropdown, Popover, Tooltip } from 'antd'
import { Bell, ChevronDown, KeyRound, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { systemApi } from '../api/system'
import { feedback } from '../api/feedback'
import { useAuthStore } from '../store/auth'
import type { AppNotification } from '../types'
import { MENU_GROUPS } from '../router/menu'
import { cn } from '../utils/cn'
import { dateTimeText, initialOf } from '../utils/format'
import ChangePasswordModal from '../pages/settings/ChangePasswordModal'

const SIDER_WIDTH = 236
const SIDER_COLLAPSED = 72
const HEADER_HEIGHT = 60

export default function BasicLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, can } = useAuthStore()

  const [collapsed, setCollapsed] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [pwdOpen, setPwdOpen] = useState(false)

  // 按角色权限过滤菜单
  const groups = useMemo(
    () =>
      MENU_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.module || can(item.module, 'view')),
      })).filter((group) => group.items.length > 0),
    [can],
  )

  const activePath = useMemo(() => {
    const paths = groups.flatMap((g) => g.items.map((i) => i.path))
    // 取最长匹配，保证 /leases/9 也能点亮 /leases
    const matched = paths
      .filter((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))
      .sort((a, b) => b.length - a.length)
    return matched[0] ?? ''
  }, [groups, location.pathname])

  const currentLabel = useMemo(() => {
    for (const group of groups) {
      const hit = group.items.find((i) => i.path === activePath)
      if (hit) return { group: group.label, label: hit.label }
    }
    return { group: '概览', label: '数据统计看板' }
  }, [groups, activePath])

  const loadNotifications = () => {
    systemApi
      .notifications()
      .then((res) => {
        setNotifications(res.list)
        setUnread(res.unread)
      })
      .catch((err) => console.error('[layout] 消息加载失败:', err))
  }

  useEffect(() => {
    loadNotifications()
    const timer = setInterval(loadNotifications, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const handleLogout = async () => {
    await logout()
    feedback.success('已退出登录')
    navigate('/login', { replace: true })
  }

  const notificationPanel = (
    <div className="w-[360px]">
      <div className="flex items-center justify-between px-1 pb-3">
        <span className="text-[14px] font-semibold text-[#1D1D1F]">站内消息</span>
        {unread > 0 && (
          <button
            type="button"
            className="cursor-pointer text-[12px] text-[#0066CC] hover:underline"
            onClick={() => {
              systemApi.readAllNotifications().then(() => {
                loadNotifications()
                feedback.success('已全部标记为已读')
              })
            }}
          >
            全部已读
          </button>
        )}
      </div>
      <div className="max-h-[380px] overflow-y-auto">
        {notifications.length === 0 && (
          <p className="py-10 text-center text-[13px] text-[#AEAEB2]">暂无消息</p>
        )}
        {notifications.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              'mb-1 flex w-full cursor-pointer flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-colors',
              item.is_read ? 'hover:bg-black/[0.03]' : 'bg-black/[0.035] hover:bg-black/[0.055]',
            )}
            onClick={() => {
              if (!item.is_read) {
                systemApi.readNotification(item.id).then(loadNotifications)
              }
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    item.level === 'danger'
                      ? '#D70015'
                      : item.level === 'warning'
                        ? '#C77700'
                        : '#0066CC',
                }}
              />
              <span className="truncate text-[13px] font-medium text-[#1D1D1F]">{item.title}</span>
            </div>
            <span className="line-clamp-2 pl-3.5 text-[12px] leading-5 text-[#86868B]">
              {item.content}
            </span>
            <span className="pl-3.5 text-[11px] text-[#AEAEB2]">
              {dateTimeText(item.created_at)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-white">
      {/* 侧边栏 */}
      <aside
        className="fixed left-0 top-0 z-20 flex h-screen flex-col bg-[#FBFBFD] transition-[width] duration-300 hairline-r"
        style={{ width: collapsed ? SIDER_COLLAPSED : SIDER_WIDTH }}
      >
        <div
          className="flex shrink-0 items-center gap-2.5 px-5"
          style={{ height: HEADER_HEIGHT }}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#1D1D1F] text-[13px] font-semibold text-white">
            FA
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold leading-4 text-[#1D1D1F]">
                厂房公寓租赁
              </p>
              <p className="truncate text-[11px] leading-4 text-[#86868B]">管理系统</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((group) => (
            <div key={group.key} className="mb-3">
              {!collapsed && (
                <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-[#AEAEB2]">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = item.icon
                const active = item.path === activePath
                const button = (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (item.placeholder) {
                        feedback.info(`「${item.label}」为下一阶段功能，当前提供框架页`)
                      }
                      navigate(item.path)
                    }}
                    className={cn(
                      'mb-0.5 flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition-colors duration-200',
                      active
                        ? 'bg-black/[0.06] font-medium text-[#1D1D1F]'
                        : 'text-[#6E6E73] hover:bg-black/[0.035] hover:text-[#1D1D1F]',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <Icon size={17} className="shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.placeholder && (
                          <span className="ml-auto shrink-0 rounded-md bg-black/[0.05] px-1.5 py-[1px] text-[10px] text-[#AEAEB2]">
                            待建设
                          </span>
                        )}
                      </>
                    )}
                  </button>
                )

                return collapsed ? (
                  <Tooltip key={item.key} title={item.label} placement="right">
                    {button}
                  </Tooltip>
                ) : (
                  button
                )
              })}
            </div>
          ))}
        </nav>

        <button
          type="button"
          className="mx-2 mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-[10px] py-2 text-[12.5px] text-[#86868B] transition-colors hover:bg-black/[0.035] hover:text-[#1D1D1F]"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span>收起菜单</span>}
        </button>
      </aside>

      {/* 主区域 */}
      <div
        className="flex min-h-screen flex-1 flex-col transition-[margin] duration-300"
        style={{ marginLeft: collapsed ? SIDER_COLLAPSED : SIDER_WIDTH }}
      >
        <header
          className="frosted sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 px-7 hairline-b"
          style={{ height: HEADER_HEIGHT }}
        >
          <div className="flex min-w-0 items-center gap-2 text-[13px]">
            <span className="text-[#86868B]">{currentLabel.group}</span>
            <span className="text-[#D2D2D7]">/</span>
            <span className="truncate font-medium text-[#1D1D1F]">{currentLabel.label}</span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Popover
              content={notificationPanel}
              trigger="click"
              placement="bottomRight"
              arrow={false}
              styles={{ body: { padding: 12 } }}
            >
              <button
                type="button"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[#6E6E73] transition-colors hover:bg-black/[0.05] hover:text-[#1D1D1F]"
              >
                <Badge count={unread} size="small" offset={[2, -2]}>
                  <Bell size={17} />
                </Badge>
              </button>
            </Popover>

            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'profile',
                    label: (
                      <div className="py-1">
                        <p className="text-[13px] font-medium text-[#1D1D1F]">{user?.realName}</p>
                        <p className="text-[12px] text-[#86868B]">{user?.roleName}</p>
                      </div>
                    ),
                    disabled: true,
                  },
                  { type: 'divider' },
                  { key: 'password', label: '修改密码', icon: <KeyRound size={15} /> },
                  { key: 'logout', label: '退出登录', icon: <LogOut size={15} />, danger: true },
                ],
                onClick: ({ key }) => {
                  if (key === 'password') setPwdOpen(true)
                  if (key === 'logout') handleLogout()
                },
              }}
            >
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-black/[0.05]"
              >
                <Avatar size={30} style={{ background: '#1D1D1F', fontSize: 13 }}>
                  {initialOf(user?.realName)}
                </Avatar>
                <span className="text-[13px] text-[#1D1D1F]">{user?.realName}</span>
                <ChevronDown size={14} className="text-[#AEAEB2]" />
              </button>
            </Dropdown>
          </div>
        </header>

        <main className="flex-1 px-7 py-6">
          <div className="mx-auto w-full max-w-[1560px] animate-fade">
            <Outlet />
          </div>
        </main>
      </div>

      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </div>
  )
}
