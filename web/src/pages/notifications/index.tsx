import { useCallback, useEffect, useState } from 'react'
import { Button, Skeleton, Tabs } from 'antd'
import { BellRing, CheckCheck, Megaphone } from 'lucide-react'
import { systemApi } from '../../api/system'
import { feedback } from '../../api/feedback'
import { EmptyHint, PageCard } from '../../components/Surface'
import { dateTimeText } from '../../utils/format'
import { cn } from '../../utils/cn'
import type { Announcement, AppNotification } from '../../types'

const CATEGORY_LABEL: Record<string, string> = {
  notice: '通知',
  water: '停水',
  power: '停电',
  safety: '安全整改',
  rule: '租赁规则',
}

const LEVEL_COLOR: Record<string, string> = {
  info: '#0066CC',
  warning: '#C77700',
  danger: '#D70015',
}

export default function NotificationsPage() {
  const [tab, setTab] = useState('messages')
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  const loadMessages = useCallback(() => {
    systemApi
      .notifications()
      .then((res) => {
        setNotifications(res.list)
        setUnread(res.unread)
      })
      .catch((err) => console.error('[notification] 消息加载失败:', err))
  }, [])

  const loadAnnouncements = useCallback(() => {
    systemApi
      .announcements({ pageSize: 50 })
      .then((res) => setAnnouncements(res.list))
      .catch((err) => console.error('[notification] 公告加载失败:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadMessages()
    loadAnnouncements()
  }, [loadMessages, loadAnnouncements])

  const markAllRead = async () => {
    await systemApi.readAllNotifications()
    feedback.success('已全部标记为已读')
    loadMessages()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-[#1D1D1F]">
            消息与公告
          </h1>
          <p className="mt-1.5 text-[13.5px] text-[#86868B]">
            租约到期、账单逾期与新报修工单会自动生成站内提醒；公告面向园区统一发布
          </p>
        </div>
        {tab === 'messages' && unread > 0 && (
          <Button icon={<CheckCheck size={15} />} onClick={markAllRead}>
            全部标记已读（{unread}）
          </Button>
        )}
      </div>

      <PageCard>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'messages',
              label: (
                <span className="flex items-center gap-1.5">
                  <BellRing size={14} />
                  站内消息
                  {unread > 0 && (
                    <span className="rounded-full bg-[#D70015] px-1.5 text-[11px] text-white">
                      {unread}
                    </span>
                  )}
                </span>
              ),
              children: (
                <div className="pt-2">
                  {loading ? (
                    <Skeleton active paragraph={{ rows: 6 }} />
                  ) : notifications.length === 0 ? (
                    <EmptyHint title="暂无站内消息" description="租约到期与账单逾期时，这里会自动生成提醒" />
                  ) : (
                    <div className="space-y-2">
                      {notifications.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'flex gap-4 rounded-2xl border px-4 py-3.5 transition-colors',
                            item.is_read
                              ? 'border-black/[0.05] bg-white'
                              : 'border-black/[0.07] bg-black/[0.02]',
                          )}
                        >
                          <span
                            className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                            style={{ background: LEVEL_COLOR[item.level] ?? '#AEAEB2' }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-4">
                              <p className="truncate text-[13.5px] font-medium text-[#1D1D1F]">
                                {item.title}
                              </p>
                              <span className="shrink-0 text-[12px] text-[#AEAEB2]">
                                {dateTimeText(item.created_at)}
                              </span>
                            </div>
                            <p className="mt-1 text-[13px] leading-6 text-[#6E6E73]">{item.content}</p>
                            {!item.is_read && (
                              <button
                                type="button"
                                className="mt-1.5 cursor-pointer text-[12px] text-[#0066CC] hover:underline"
                                onClick={() => {
                                  systemApi.readNotification(item.id).then(loadMessages)
                                }}
                              >
                                标记已读
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'announcements',
              label: (
                <span className="flex items-center gap-1.5">
                  <Megaphone size={14} />
                  园区公告
                </span>
              ),
              children: (
                <div className="space-y-3 pt-2">
                  {announcements.length === 0 && (
                    <EmptyHint title="暂无公告" description="停水、停电、安全整改与租赁规则通知会发布在这里" />
                  )}
                  {announcements.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-black/[0.05] px-5 py-4"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        {item.is_top === 1 && (
                          <span className="rounded-md bg-[rgba(215,0,21,0.09)] px-1.5 py-[2px] text-[10.5px] font-medium text-[#D70015]">
                            置顶
                          </span>
                        )}
                        <span className="rounded-md bg-black/[0.05] px-1.5 py-[2px] text-[10.5px] text-[#6E6E73]">
                          {CATEGORY_LABEL[item.category] ?? '通知'}
                        </span>
                        <h3 className="text-[15px] font-semibold text-[#1D1D1F]">{item.title}</h3>
                      </div>
                      <p className="mt-2.5 text-[13.5px] leading-7 text-[#6E6E73]">{item.content}</p>
                      <p className="mt-3 text-[12px] text-[#AEAEB2]">
                        {item.publisher ?? '系统管理员'} · {dateTimeText(item.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </PageCard>
    </div>
  )
}
