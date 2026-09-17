import { useEffect, useState } from 'react'
import { Button, Descriptions, Drawer, Input } from 'antd'
import { Link } from 'react-router-dom'
import { feedback } from '../../api/feedback'
import { viewingApi } from '../../api/viewing'
import { StatusTag } from '../../components/StatusTag'
import { PROPERTY_TYPE, VIEWING_STATUS, VIEWING_TRANSITIONS } from '../../utils/constants'
import { dateTimeText } from '../../utils/format'
import type { ViewingDetail, ViewingStatus } from '../../types'

interface Props {
  open: boolean
  detail: ViewingDetail | null
  onClose: () => void
  /** 状态或跟进记录变更后回拉详情 */
  onChanged: (id: number) => void
  /** 转为签约：跳转新建租约并预填 */
  onConvert: (record: ViewingDetail) => void
}

/**
 * 看房预约详情抽屉：基本信息 + 状态流转 + 跟进时间线。
 * 跟进记录倒序展示，最新一条在最上方，便于快速接续沟通。
 */
export default function ViewingDetailDrawer({ open, detail, onClose, onChanged, onConvert }: Props) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setContent('')
  }, [detail?.id])

  const nextStatuses = detail
    ? VIEWING_TRANSITIONS[detail.status].filter((status) => status !== 'signed')
    : []
  const canConvert = detail ? VIEWING_TRANSITIONS[detail.status].includes('signed') : false

  const handleStatus = async (next: ViewingStatus) => {
    if (!detail) return
    try {
      await viewingApi.updateStatus(detail.id, next)
      feedback.success(`已标记为「${VIEWING_STATUS[next].label}」`)
      onChanged(detail.id)
    } catch (err) {
      console.error('[viewing] 状态流转失败:', err)
    }
  }

  const handleAddFollowUp = async () => {
    if (!detail) return
    if (!content.trim()) {
      feedback.warning('请输入跟进内容')
      return
    }
    setSubmitting(true)
    try {
      await viewingApi.addFollowUp(detail.id, content.trim())
      feedback.success('跟进记录已添加')
      setContent('')
      onChanged(detail.id)
    } catch (err) {
      console.error('[viewing] 追加跟进失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer
      title={detail ? `看房详情 · ${detail.tenant_name}` : '看房详情'}
      width={720}
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      {detail && (
        <div className="space-y-6">
          <Descriptions column={2} size="small" colon={false}>
            <Descriptions.Item label="租客姓名/公司">{detail.tenant_name}</Descriptions.Item>
            <Descriptions.Item label="联系电话">{detail.phone}</Descriptions.Item>
            <Descriptions.Item label="房源业态">
              {PROPERTY_TYPE[detail.property_type]}
            </Descriptions.Item>
            <Descriptions.Item label="意向房源">{detail.property_name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="预约时间">{dateTimeText(detail.appoint_time)}</Descriptions.Item>
            <Descriptions.Item label="当前状态">
              <StatusTag meta={VIEWING_STATUS[detail.status]} />
            </Descriptions.Item>
            <Descriptions.Item label="登记时间">{dateTimeText(detail.created_at)}</Descriptions.Item>
            <Descriptions.Item label="关联租约">
              {detail.lease_id && detail.lease_no ? (
                <Link to={`/leases/${detail.lease_id}`} className="text-[#0066CC] hover:underline">
                  {detail.lease_no}
                </Link>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="需求备注" span={2}>
              {detail.remark ?? '—'}
            </Descriptions.Item>
          </Descriptions>

          <div className="rounded-2xl border border-black/[0.06] px-4 py-3.5">
            <p className="text-[12px] text-[#86868B]">推进状态</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {nextStatuses.length === 0 && !canConvert && (
                <span className="text-[13px] text-[#AEAEB2]">该记录已到达终态，无可执行动作</span>
              )}
              {nextStatuses.map((status) => (
                <Button key={status} size="small" onClick={() => handleStatus(status)}>
                  标记为{VIEWING_STATUS[status].label}
                </Button>
              ))}
              {canConvert && (
                <Button size="small" type="primary" onClick={() => onConvert(detail)}>
                  转为签约
                </Button>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <h3 className="text-[15px] font-semibold text-[#1D1D1F]">跟进记录</h3>
              <span className="text-[12px] text-[#86868B]">共 {detail.follow_ups.length} 条</span>
            </div>

            <div className="mt-4 space-y-4">
              {detail.follow_ups.length === 0 && (
                <p className="rounded-2xl border border-dashed border-black/10 py-8 text-center text-[13px] text-[#AEAEB2]">
                  暂无跟进记录，可在下方添加议价、装修抵扣洽谈、租期沟通等内容
                </p>
              )}
              {detail.follow_ups.map((item) => (
                <div key={item.id} className="border-l-2 border-black/[0.08] pl-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#1D1D1F]">
                      {item.operator ?? '系统'}
                    </span>
                    <span className="text-[12px] text-[#AEAEB2]">{dateTimeText(item.follow_up_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-[#6E6E73]">
                    {item.content}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-black/[0.06] p-4">
              <Input.TextArea
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="记录本次沟通要点，如：客户意向 800㎡，希望装修费分 6 期抵扣租金"
              />
              <div className="mt-3 flex justify-end">
                <Button type="primary" loading={submitting} onClick={handleAddFollowUp}>
                  追加跟进
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}
