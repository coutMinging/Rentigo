import { useEffect, useState } from 'react'
import { Alert, Button, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Table } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { Plus, Trash2 } from 'lucide-react'
import { billApi } from '../../api/bill'
import { feedback } from '../../api/feedback'
import { MoneyText } from '../../components/DataDisplay'
import { SectionTitle } from '../../components/Surface'
import { StatusTag } from '../../components/StatusTag'
import { BILL_ITEM_TYPE, BILL_STATUS, PAY_METHOD } from '../../utils/constants'
import { dateText, money, periodText } from '../../utils/format'
import type { Bill, BillItem, Payment } from '../../types'

/** 登记收款：支持全额与部分收款，超出欠费金额会被后端拒绝 */
export function PaymentModal({
  open,
  bill,
  onClose,
  onDone,
}: {
  open: boolean
  bill: Bill | null
  onClose: () => void
  onDone: () => void
}) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !bill) return
    form.resetFields()
    form.setFieldsValue({
      amount: bill.outstanding > 0 ? bill.outstanding : 0,
      pay_date: dayjs(),
      method: 'transfer',
    })
  }, [open, bill, form])

  const handleOk = async () => {
    if (!bill) return
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      const result = await billApi.addPayment(bill.id, {
        amount: values.amount,
        pay_date: (values.pay_date as Dayjs).format('YYYY-MM-DD'),
        method: values.method,
        remark: values.remark,
      })
      feedback.success(
        result.outstanding > 0
          ? `已收款 ${money(values.amount)} 元，尚欠 ${money(result.outstanding)} 元`
          : '该期账单已结清',
      )
      onDone()
      onClose()
    } catch (err) {
      console.error('[bill] 收款登记失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`登记收款 · ${bill?.bill_no ?? ''}`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={submitting}
      okText="确认收款"
      width={480}
      destroyOnHidden
    >
      {bill && (
        <>
          <div className="mb-5 rounded-xl bg-[#FBFBFD] px-4 py-3">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#86868B]">本期待收</span>
              <MoneyText value={bill.payable_amount} strong />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span className="text-[#86868B]">已收</span>
              <MoneyText value={bill.paid_amount} tone="muted" />
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-black/[0.06] pt-1.5 text-[13px]">
              <span className="text-[#86868B]">尚欠</span>
              <MoneyText value={bill.outstanding} tone="danger" strong />
            </div>
          </div>

          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item
              name="amount"
              label="收款金额（元）"
              rules={[
                { required: true, message: '请输入收款金额' },
                {
                  validator: (_r, v) =>
                    Number(v) > bill.outstanding
                      ? Promise.reject(new Error(`不能超过欠费金额 ${money(bill.outstanding)} 元`))
                      : Promise.resolve(),
                },
              ]}
            >
              <InputNumber min={0.01} precision={2} className="w-full" />
            </Form.Item>
            <Form.Item name="pay_date" label="收款日期" rules={[{ required: true, message: '请选择日期' }]}>
              <DatePicker className="w-full" format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="method" label="支付方式" rules={[{ required: true }]}>
              <Select
                options={Object.entries(PAY_METHOD).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input placeholder="如：首笔部分付款、尾款结清" />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  )
}

/** 追加费用：水电、车位、违约金等 */
export function AddFeeModal({
  open,
  bill,
  onClose,
  onDone,
}: {
  open: boolean
  bill: Bill | null
  onClose: () => void
  onDone: () => void
}) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({ type: 'electric' })
    }
  }, [open, form])

  const handleOk = async () => {
    if (!bill) return
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      await billApi.addItem(bill.id, {
        type: values.type,
        name: values.name,
        amount: values.amount,
        remark: values.remark,
      })
      feedback.success('费用已追加，应收金额同步更新')
      onDone()
      onClose()
    } catch (err) {
      console.error('[bill] 追加费用失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`追加费用 · ${bill?.bill_no ?? ''}`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={submitting}
      okText="确认追加"
      width={460}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        className="mb-5"
        message="追加后账单应收金额会自动重算"
        description="租金、物业费与装修抵扣由租约自动生成，此处只能追加水电、车位、违约金等额外费用。"
      />
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="type" label="费用类型" rules={[{ required: true }]}>
          <Select
            options={Object.entries(BILL_ITEM_TYPE).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item name="name" label="费用名称" extra="留空则使用费用类型名称">
          <Input placeholder="如：10 月生产用电" />
        </Form.Item>
        <Form.Item name="amount" label="金额（元）" rules={[{ required: true, message: '请输入金额' }]}>
          <InputNumber precision={2} className="w-full" placeholder="正数增加应收，负数冲减" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input placeholder="如：按实际抄表读数结算" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/** 账单详情抽屉：费用明细 + 收款流水，支持删除追加的费用项与撤销收款 */
export function BillDetailDrawer({
  open,
  billId,
  canEdit,
  onClose,
  onChanged,
}: {
  open: boolean
  billId: number | null
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [data, setData] = useState<{ bill: Bill; items: BillItem[]; payments: Payment[] } | null>(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (!billId) return
    setLoading(true)
    billApi
      .detail(billId)
      .then(setData)
      .catch((err) => console.error('[bill] 详情加载失败:', err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open && billId) load()
    else setData(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, billId])

  const handleRemoveItem = async (item: BillItem) => {
    const confirmed = await feedback.confirm('删除费用项', `将删除「${item.name}」并重算应收金额。`)
    if (!confirmed) return

    try {
      await billApi.removeItem(item.id)
      feedback.success('费用项已删除')
      load()
      onChanged()
    } catch (err) {
      console.error('[bill] 删除费用项失败:', err)
    }
  }

  const handleRemovePayment = async (payment: Payment) => {
    const confirmed = await feedback.confirm(
      '撤销收款记录',
      `将撤销 ${money(payment.amount)} 元的收款登记，账单状态会重新计算。`,
    )
    if (!confirmed) return

    try {
      await billApi.removePayment(payment.id)
      feedback.success('收款记录已撤销')
      load()
      onChanged()
    } catch (err) {
      console.error('[bill] 撤销收款失败:', err)
    }
  }

  return (
    <Drawer
      title={data ? `账单详情 · ${data.bill.bill_no}` : '账单详情'}
      width={680}
      open={open}
      onClose={onClose}
      loading={loading}
    >
      {data && (
        <div className="space-y-7">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <StatusTag meta={BILL_STATUS[data.bill.status]} />
              {data.bill.is_overdue && (
                <span className="text-[12.5px] text-[#D70015]">
                  已逾期 {data.bill.overdue_days ?? 0} 天
                </span>
              )}
            </div>
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="租客">{data.bill.tenant_name}</Descriptions.Item>
              <Descriptions.Item label="租约号">{data.bill.lease_no}</Descriptions.Item>
              <Descriptions.Item label="关联房源" span={2}>
                {data.bill.property_names}
              </Descriptions.Item>
              <Descriptions.Item label="账期" span={2}>
                {periodText(data.bill.period_start, data.bill.period_end)}
              </Descriptions.Item>
              <Descriptions.Item label="应交日期">{dateText(data.bill.due_date)}</Descriptions.Item>
              <Descriptions.Item label="期次">第 {data.bill.period_index} 期</Descriptions.Item>
              <Descriptions.Item label="应收">
                <MoneyText value={data.bill.payable_amount} strong />
              </Descriptions.Item>
              <Descriptions.Item label="实收">
                <MoneyText value={data.bill.paid_amount} tone="muted" />
              </Descriptions.Item>
              <Descriptions.Item label="尚欠" span={2}>
                <MoneyText
                  value={data.bill.outstanding}
                  tone={data.bill.outstanding > 0 ? 'danger' : 'muted'}
                  strong
                />
              </Descriptions.Item>
            </Descriptions>
          </div>

          <div>
            <SectionTitle title="费用明细" subtitle="租金与物业费由租约生成，其余可手工调整" />
            <Table
              rowKey="id"
              size="small"
              className="mt-4"
              pagination={false}
              dataSource={data.items}
              columns={[
                { title: '类型', dataIndex: 'type_label', width: 110 },
                { title: '名称', dataIndex: 'name' },
                {
                  title: '金额',
                  dataIndex: 'amount',
                  width: 130,
                  align: 'right',
                  render: (v: number) => (
                    <span
                      className="tabular-nums text-[13px]"
                      style={{ color: v < 0 ? '#7C5CFF' : '#1D1D1F' }}
                    >
                      {v < 0 ? '-' : ''}
                      {money(Math.abs(v))}
                    </span>
                  ),
                },
                {
                  title: '操作',
                  key: 'action',
                  width: 70,
                  align: 'center',
                  render: (_v, item) =>
                    canEdit && !['rent', 'property', 'deduction'].includes(item.type) ? (
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<Trash2 size={14} />}
                        onClick={() => handleRemoveItem(item)}
                      />
                    ) : (
                      <span className="text-[12px] text-[#C7C7CC]">—</span>
                    ),
                },
              ]}
            />
          </div>

          <div>
            <SectionTitle title="收款流水" subtitle="每一笔收款都可追溯到具体账单" />
            <Table
              rowKey="id"
              size="small"
              className="mt-4"
              pagination={false}
              dataSource={data.payments}
              columns={[
                { title: '收款日期', dataIndex: 'pay_date', width: 120 },
                {
                  title: '金额',
                  dataIndex: 'amount',
                  width: 130,
                  align: 'right',
                  render: (v: number) => <MoneyText value={v} tone="success" strong />,
                },
                {
                  title: '方式',
                  dataIndex: 'method',
                  width: 100,
                  render: (v: string) => PAY_METHOD[v as 'transfer'] ?? v,
                },
                { title: '经办人', dataIndex: 'operator', width: 90 },
                {
                  title: '操作',
                  key: 'action',
                  width: 70,
                  align: 'center',
                  render: (_v, p) =>
                    canEdit ? (
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<Trash2 size={14} />}
                        onClick={() => handleRemovePayment(p)}
                      />
                    ) : null,
                },
              ]}
            />
            {data.payments.length === 0 && (
              <p className="mt-3 text-center text-[13px] text-[#AEAEB2]">暂无收款记录</p>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}

/** 空位占位：保持文件导出结构完整 */
export const BillModals = { PaymentModal, AddFeeModal, BillDetailDrawer }
export const PlusIcon = Plus
