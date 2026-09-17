import { useEffect, useState } from 'react'
import { Button, Form, Input, InputNumber, Modal, Select } from 'antd'
import { feedback } from '../../api/feedback'
import { workOrderApi } from '../../api/workOrder'
import { WORK_ORDER_STATUS, WORK_ORDER_TRANSITIONS } from '../../utils/constants'
import type { WorkOrder, WorkOrderStatus } from '../../types'

interface FormValues {
  status: WorkOrderStatus
  assignee?: string
  progress?: string
  cost?: number
  finish_remark?: string
}

interface Props {
  open: boolean
  record: WorkOrder | null
  onClose: () => void
  onDone: () => void
}

/**
 * 状态流转弹窗。
 * 可选目标状态来自与后端一致的白名单；选择当前状态即「仅更新维修信息」，
 * 因此同一入口既能派单、完工，也能随时补充维修进度。
 */
export default function WorkOrderStatusModal({ open, record, onClose, onDone }: Props) {
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const target = Form.useWatch('status', form) ?? record?.status ?? 'pending'

  useEffect(() => {
    if (!open || !record) return
    form.resetFields()
    form.setFieldsValue({
      status: record.status,
      assignee: record.assignee ?? '',
      progress: '',
      cost: record.cost ?? 0,
      finish_remark: record.finish_remark ?? '',
    })
  }, [open, record, form])

  if (!record) return null

  const current = record.status
  const targetStatus: WorkOrderStatus = target
  const changed = targetStatus !== current

  const options = [current, ...WORK_ORDER_TRANSITIONS[current]].map((status) => ({
    value: status,
    label:
      status === current
        ? `仅更新维修信息（保持「${WORK_ORDER_STATUS[status].label}」）`
        : `变更为「${WORK_ORDER_STATUS[status].label}」`,
  }))

  const showAssignee = targetStatus === 'repairing'
  const showProgress = targetStatus === 'repairing' || targetStatus === 'done'
  const showCost = targetStatus === 'done' || current === 'done'
  const showFinishRemark = targetStatus === 'done'

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      await workOrderApi.updateStatus(record.id, {
        status: values.status,
        assignee: values.assignee?.trim() || null,
        progress: values.progress?.trim() || null,
        cost: values.cost ?? null,
        finish_remark: values.finish_remark?.trim() || null,
      })
      feedback.success(
        values.status === current
          ? `工单 ${record.order_no} 维修信息已更新`
          : `工单 ${record.order_no} 已变更为「${WORK_ORDER_STATUS[values.status].label}」`,
      )
      onDone()
      onClose()
    } catch (err) {
      console.error('[workOrder] 状态流转失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`流转工单 ${record.order_no}`}
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={handleSubmit}>
            确认
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
        <Form.Item name="status" label="目标状态" rules={[{ required: true }]}>
          <Select options={options} />
        </Form.Item>

        {showAssignee && (
          <Form.Item
            name="assignee"
            label="维修人员"
            rules={[{ required: !record.assignee, message: '派单前请先指定维修人员' }]}
            extra={record.assignee ? `当前维修人：${record.assignee}` : '可填写姓名与班组，如：王建国（机电班）'}
          >
            <Input placeholder="如：王建国（机电班）" maxLength={30} />
          </Form.Item>
        )}

        {showProgress && (
          <Form.Item name="progress" label="维修进度说明">
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              placeholder="如：已更换链条导轨，正在试运行观察"
            />
          </Form.Item>
        )}

        {showCost && (
          <Form.Item name="cost" label="维修费用（元）">
            <InputNumber min={0} precision={2} className="w-full" placeholder="0 表示暂无费用" />
          </Form.Item>
        )}

        {showFinishRemark && (
          <Form.Item
            name="finish_remark"
            label="完工备注"
            rules={[{ required: true, message: '完工时请填写完工备注' }]}
          >
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              placeholder="如：现场测试正常，已请报修人签字确认"
            />
          </Form.Item>
        )}

        {changed && (
          <p className="text-[12px] leading-5 text-[#86868B]">
            将执行「{WORK_ORDER_STATUS[current].label} → {WORK_ORDER_STATUS[targetStatus].label}」的流转，
            已关闭的工单不可回退。
          </p>
        )}
      </Form>
    </Modal>
  )
}
