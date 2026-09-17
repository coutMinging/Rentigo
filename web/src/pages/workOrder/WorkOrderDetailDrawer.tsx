import { useEffect, useState } from 'react'
import { Button, Drawer, Image, Spin } from 'antd'
import { Pencil, Wrench } from 'lucide-react'
import { workOrderApi } from '../../api/workOrder'
import { MoneyText } from '../../components/DataDisplay'
import { FieldList } from '../../components/Surface'
import { StatusTag } from '../../components/StatusTag'
import { PROPERTY_TYPE, WORK_ORDER_STATUS } from '../../utils/constants'
import { dateTimeText } from '../../utils/format'
import type { WorkOrder } from '../../types'

interface Props {
  open: boolean
  id: number | null
  canEdit: boolean
  onClose: () => void
  onEdit: (record: WorkOrder) => void
  onStatus: (record: WorkOrder) => void
}

export default function WorkOrderDetailDrawer({
  open,
  id,
  canEdit,
  onClose,
  onEdit,
  onStatus,
}: Props) {
  const [detail, setDetail] = useState<WorkOrder | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || id === null) return
    setLoading(true)
    setDetail(null)
    workOrderApi
      .detail(id)
      .then(setDetail)
      .catch((err) => console.error('[workOrder] 详情加载失败:', err))
      .finally(() => setLoading(false))
  }, [open, id])

  return (
    <Drawer
      title="工单详情"
      width={620}
      open={open}
      onClose={onClose}
      destroyOnHidden
      footer={
        detail ? (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#86868B]">
              最近更新：{dateTimeText(detail.updated_at)}
            </span>
            {canEdit && (
              <div className="flex gap-2">
                <Button icon={<Pencil size={15} />} onClick={() => onEdit(detail)}>
                  编辑信息
                </Button>
                <Button type="primary" icon={<Wrench size={15} />} onClick={() => onStatus(detail)}>
                  流转 / 更新进度
                </Button>
              </div>
            )}
          </div>
        ) : null
      }
    >
      {loading && (
        <div className="flex justify-center py-20">
          <Spin size="small" />
        </div>
      )}

      {!loading && !detail && (
        <p className="py-20 text-center text-[13px] text-[#AEAEB2]">工单不存在或已被删除</p>
      )}

      {!loading && detail && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[20px] font-semibold tracking-tight text-[#1D1D1F]">
                {detail.order_no}
              </p>
              <p className="mt-1 text-[13px] text-[#86868B]">
                {PROPERTY_TYPE[detail.property_type]} · {detail.property_name ?? '未关联房源'}
              </p>
            </div>
            <StatusTag meta={WORK_ORDER_STATUS[detail.status]} />
          </div>

          <FieldList
            items={[
              { label: '报修人', value: detail.reporter },
              { label: '联系电话', value: detail.phone ?? '—' },
              { label: '维修人员', value: detail.assignee ?? '待指派' },
              {
                label: '维修费用',
                value: detail.cost > 0 ? <MoneyText value={detail.cost} strong /> : '—',
              },
              { label: '报修时间', value: dateTimeText(detail.created_at) },
              { label: '最近更新', value: dateTimeText(detail.updated_at) },
            ]}
          />

          <div>
            <p className="text-[12px] text-[#86868B]">故障描述</p>
            <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-6 text-[#1D1D1F]">
              {detail.fault_desc}
            </p>
          </div>

          <div>
            <p className="text-[12px] text-[#86868B]">故障图片</p>
            {detail.images.length > 0 ? (
              <Image.PreviewGroup>
                <div className="mt-2 flex flex-wrap gap-3">
                  {detail.images.map((url) => (
                    <Image
                      key={url}
                      src={url}
                      width={104}
                      height={104}
                      className="rounded-xl object-cover"
                      style={{ objectFit: 'cover' }}
                    />
                  ))}
                </div>
              </Image.PreviewGroup>
            ) : (
              <p className="mt-1.5 text-[13px] text-[#AEAEB2]">未上传故障图片</p>
            )}
          </div>

          <div className="rounded-2xl bg-black/[0.025] px-4 py-3.5">
            <p className="text-[12px] text-[#86868B]">最近维修进度</p>
            <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-6 text-[#1D1D1F]">
              {detail.progress ?? '暂无进度说明'}
            </p>
          </div>

          {detail.finish_remark && (
            <div className="rounded-2xl bg-[rgba(29,154,78,0.07)] px-4 py-3.5">
              <p className="text-[12px] text-[#1D9A4E]">完工备注</p>
              <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-6 text-[#1D1D1F]">
                {detail.finish_remark}
              </p>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
