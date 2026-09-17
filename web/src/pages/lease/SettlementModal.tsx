import { useEffect, useState } from 'react'
import { Alert, Button, Col, DatePicker, Descriptions, Divider, Input, InputNumber, Modal, Row, Switch, Table } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { leaseApi, type SettlementPayload } from '../../api/lease'
import { feedback } from '../../api/feedback'
import { MoneyText } from '../../components/DataDisplay'
import { money } from '../../utils/format'
import type { SettlementResult } from '../../types'

interface Props {
  open: boolean
  leaseId: number
  leaseNo: string
  onClose: () => void
  onDone: () => void
}

/**
 * 退租结算单。
 * 打开即试算，改任一参数都会重新拉取后端结算结果，
 * 保证「应退 / 应补」与账单台账口径完全一致。
 */
export default function SettlementModal({ open, leaseId, leaseNo, onClose, onDone }: Props) {
  const [terminateDate, setTerminateDate] = useState<Dayjs>(dayjs())
  const [waterFee, setWaterFee] = useState(0)
  const [electricFee, setElectricFee] = useState(0)
  const [otherFee, setOtherFee] = useState(0)
  const [depositOffset, setDepositOffset] = useState(true)
  const [remark, setRemark] = useState('')

  const [result, setResult] = useState<SettlementResult | null>(null)
  const [computing, setComputing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const payload = (): SettlementPayload => ({
    terminate_date: terminateDate.format('YYYY-MM-DD'),
    water_fee: waterFee,
    electric_fee: electricFee,
    other_fee: otherFee,
    deposit_offset: depositOffset,
    remark: remark || undefined,
  })

  const compute = () => {
    setComputing(true)
    leaseApi
      .settlement(leaseId, payload())
      .then(setResult)
      .catch((err) => console.error('[settlement] 试算失败:', err))
      .finally(() => setComputing(false))
  }

  useEffect(() => {
    if (!open) return
    setTerminateDate(dayjs())
    setWaterFee(0)
    setElectricFee(0)
    setOtherFee(0)
    setDepositOffset(true)
    setRemark('')
    setResult(null)
  }, [open])

  useEffect(() => {
    if (open) compute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leaseId, terminateDate, waterFee, electricFee, otherFee, depositOffset])

  const handleConfirm = async () => {
    const confirmed = await feedback.confirm(
      '确认为该租约办理退租',
      '结算单确认后，租约会转为「已退租」，关联房源自动释放为空置，押金台账会写入抵扣与退还记录。此操作不可撤销。',
    )
    if (!confirmed) return

    setSubmitting(true)
    try {
      await leaseApi.terminate(leaseId, payload())
      feedback.success('退租结算已完成，房源已释放')
      onDone()
      onClose()
    } catch (err) {
      console.error('[settlement] 退租失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`退租结算单 · ${leaseNo}`}
      open={open}
      onCancel={onClose}
      width={780}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[#86868B]">
            结算金额由账单台账实时核算，无法手工改写
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" danger loading={submitting} onClick={handleConfirm}>
              确认退租并结算
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Row gutter={16}>
          <Col span={7}>
            <p className="mb-1.5 text-[12px] text-[#86868B]">退租日期</p>
            <DatePicker
              className="w-full"
              format="YYYY-MM-DD"
              value={terminateDate}
              onChange={(v) => v && setTerminateDate(v)}
            />
          </Col>
          <Col span={5}>
            <p className="mb-1.5 text-[12px] text-[#86868B]">水费（元）</p>
            <InputNumber min={0} precision={2} className="w-full" value={waterFee} onChange={(v) => setWaterFee(v ?? 0)} />
          </Col>
          <Col span={5}>
            <p className="mb-1.5 text-[12px] text-[#86868B]">电费（元）</p>
            <InputNumber min={0} precision={2} className="w-full" value={electricFee} onChange={(v) => setElectricFee(v ?? 0)} />
          </Col>
          <Col span={7}>
            <p className="mb-1.5 text-[12px] text-[#86868B]">其他费用（元）</p>
            <InputNumber min={0} precision={2} className="w-full" value={otherFee} onChange={(v) => setOtherFee(v ?? 0)} />
          </Col>
        </Row>

        <div className="flex items-center gap-3">
          <Switch checked={depositOffset} onChange={setDepositOffset} />
          <span className="text-[13px] text-[#1D1D1F]">用押金抵扣欠费与水电费</span>
          <span className="text-[12px] text-[#86868B]">
            {depositOffset ? '不足部分需租客补交，多余部分退还' : '押金全额退还，费用另行收取'}
          </span>
        </div>

        <div>
          <p className="mb-1.5 text-[12px] text-[#86868B]">退租说明</p>
          <Input.TextArea
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="记录退租原因、房屋验收情况等"
          />
        </div>

        <Divider className="!my-1" />

        {!result ? (
          <p className="py-8 text-center text-[13px] text-[#AEAEB2]">
            {computing ? '正在核算…' : '暂无核算结果'}
          </p>
        ) : (
          <>
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="租客">{result.tenant_name}</Descriptions.Item>
              <Descriptions.Item label="关联房源">
                {result.property_names.join('、')}
              </Descriptions.Item>
              <Descriptions.Item label="押金总额">
                <MoneyText value={result.deposit_amount} strong />
              </Descriptions.Item>
              <Descriptions.Item label="装修已抵扣">{money(result.decoration_deducted)} 元</Descriptions.Item>
              <Descriptions.Item label="装修未抵扣">
                {money(result.decoration_remainder)} 元
              </Descriptions.Item>
              <Descriptions.Item label="未结清账单">
                {result.unpaid_bills.length} 笔 · {money(result.unpaid_total)} 元
              </Descriptions.Item>
            </Descriptions>

            {result.unpaid_bills.length > 0 && (
              <Table
                rowKey="bill_no"
                size="small"
                pagination={false}
                dataSource={result.unpaid_bills}
                columns={[
                  { title: '账单号', dataIndex: 'bill_no', width: 200 },
                  { title: '应交日期', dataIndex: 'due_date', width: 120 },
                  {
                    title: '未结金额',
                    dataIndex: 'outstanding',
                    align: 'right',
                    render: (v: number) => <MoneyText value={v} tone="danger" />,
                  },
                ]}
              />
            )}

            <div className="rounded-2xl bg-[#FBFBFD] p-5">
              <Row gutter={16}>
                {[
                  { label: '押金抵扣', value: result.total_deduction, tone: 'default' as const },
                  { label: '水电及其他', value: result.water_fee + result.electric_fee + result.other_fee, tone: 'default' as const },
                  { label: '应退押金', value: result.refund_amount, tone: 'success' as const },
                  { label: '租客应补', value: result.payable_amount, tone: 'danger' as const },
                ].map((item) => (
                  <Col span={6} key={item.label}>
                    <p className="text-[12px] text-[#86868B]">{item.label}</p>
                    <MoneyText
                      value={item.value}
                      tone={item.tone}
                      strong
                      className="mt-1.5 block text-[18px]"
                    />
                  </Col>
                ))}
              </Row>
            </div>

            {result.payable_amount > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`租客仍需补交 ${money(result.payable_amount)} 元`}
                description="补交金额需通过账单收款或线下方式另行收取，系统不会自动生成新账单。"
              />
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
