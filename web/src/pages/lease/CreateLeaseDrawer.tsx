import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Steps,
  Table,
  Tag,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { leaseApi } from '../../api/lease'
import { apartmentApi, factoryApi, tenantApi } from '../../api/property'
import { feedback } from '../../api/feedback'
import { EmptyHint } from '../../components/Surface'
import { useOptions } from '../../hooks'
import { PAY_CYCLE } from '../../utils/constants'
import { money, periodText } from '../../utils/format'
import type { PlanPreview, PropertyType } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (leaseId: number) => void
}

interface FormValues {
  tenant_id: number
  property_type: PropertyType
  properties: number[]
  range: [Dayjs, Dayjs]
  pay_cycle: 'month' | 'quarter' | 'year'
  deposit_amount: number
  decoration_total: number
  decoration_periods: number
  decoration_per_month?: number
  extra_clause?: string
}

/**
 * 新建租约抽屉。
 * 采用三步式 + 右侧实时试算面板：
 * 第 3 步改动装修抵扣参数时，右侧立刻按每期列出抵扣额与实付租金，
 * 让「装修费抵扣租金」这个核心规则一眼可见，不用等保存后才看到账单。
 */
export default function CreateLeaseDrawer({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm<FormValues>()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [preview, setPreview] = useState<PlanPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [propertyType, setPropertyType] = useState<PropertyType>('factory')

  const { options: tenants } = useOptions(() => tenantApi.options(), [open])
  const { options: factories } = useOptions(() => factoryApi.options(), [open])
  const { options: apartmentRooms } = useOptions(() => apartmentApi.roomOptions(), [open])

  useEffect(() => {
    if (!open) return
    setStep(0)
    setPreview(null)
    setPropertyType('factory')
    form.resetFields()
    form.setFieldsValue({
      property_type: 'factory',
      pay_cycle: 'month',
      deposit_amount: 0,
      decoration_total: 0,
      decoration_periods: 0,
      range: [dayjs(), dayjs().add(1, 'year').subtract(1, 'day')] as [Dayjs, Dayjs],
    })
  }, [open, form])

  const propertyOptions = useMemo(() => {
    if (propertyType === 'factory') {
      return (factories ?? []).map((f) => ({
        value: f.id,
        label: `${f.name}（${f.total_area}㎡ · ${f.rent_price} 元/㎡/月）`,
        disabled: f.status === 'disabled',
      }))
    }
    return (apartmentRooms ?? [])
      .filter((r) => r.status !== 'repair')
      .map((r) => ({
        value: r.id,
        label: `${r.code} · ${r.layout ?? '—'} · ${r.area}㎡ · ${money(r.monthly_rent)} 元/月`,
      }))
  }, [propertyType, factories, apartmentRooms])

  /** 调用后端试算，服务端会自行反查房源租金，不信任前端金额 */
  const runPreview = useCallback(async () => {
    const values = form.getFieldsValue()
    if (!values.properties?.length || !values.range?.[0] || !values.range?.[1]) {
      setPreview(null)
      return
    }

    setPreviewing(true)
    try {
      const result = await leaseApi.preview({
        property_type: values.property_type,
        properties: values.properties,
        start_date: values.range[0].format('YYYY-MM-DD'),
        end_date: values.range[1].format('YYYY-MM-DD'),
        pay_cycle: values.pay_cycle ?? 'month',
        decoration_total: values.decoration_total ?? 0,
        decoration_periods: values.decoration_periods ?? 0,
        decoration_per_month: values.decoration_per_month,
      })
      setPreview(result)
    } catch (err) {
      console.error('[lease] 试算失败:', err)
      setPreview(null)
    } finally {
      setPreviewing(false)
    }
  }, [form])

  // 第 3 步的抵扣参数变化时自动重算
  useEffect(() => {
    if (open && step >= 1) runPreview()
  }, [open, step, runPreview])

  const handleNext = async () => {
    if (step === 0) {
      await form.validateFields(['tenant_id', 'properties'])
      setStep(1)
      return
    }
    if (step === 1) {
      await form.validateFields(['range', 'pay_cycle', 'deposit_amount'])
      setStep(2)
      return
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      const result = await leaseApi.create({
        tenant_id: values.tenant_id,
        property_type: values.property_type,
        properties: values.properties,
        start_date: values.range[0].format('YYYY-MM-DD'),
        end_date: values.range[1].format('YYYY-MM-DD'),
        pay_cycle: values.pay_cycle,
        deposit_amount: values.deposit_amount ?? 0,
        decoration_total: values.decoration_total ?? 0,
        decoration_periods: values.decoration_periods ?? 0,
        decoration_per_month: values.decoration_per_month ?? 0,
        extra_clause: values.extra_clause,
      })

      feedback.success(
        `租约 ${result.lease_no} 已创建，自动生成 ${result.bill_count} 期账单`,
      )
      onCreated(result.id)
      onClose()
    } catch (err) {
      console.error('[lease] 创建失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const planRows = preview?.plan ?? []

  return (
    <Drawer
      title="新建租约"
      width={1080}
      open={open}
      onClose={onClose}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[#86868B]">
            保存后系统会按缴费周期自动生成全部期次账单
          </span>
          <div className="flex gap-2">
            {step > 0 && <Button onClick={() => setStep(step - 1)}>上一步</Button>}
            <Button onClick={onClose}>取消</Button>
            {step < 2 ? (
              <Button type="primary" onClick={handleNext}>
                下一步
              </Button>
            ) : (
              <Button type="primary" loading={submitting} onClick={handleSubmit}>
                确认创建租约
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex gap-6">
        {/* 左：表单步骤 */}
        <div className="min-w-0 flex-1">
          <Steps
            current={step}
            size="small"
            className="mb-7"
            items={[
              { title: '关联房源与租客' },
              { title: '租期与费用' },
              { title: '装修抵扣与条款' },
            ]}
          />

          <Form form={form} layout="vertical" requiredMark={false}>
            {/* 第 1 步：关联 */}
            <div className={step === 0 ? 'block' : 'hidden'}>
              <Form.Item
                name="tenant_id"
                label="关联租客"
                rules={[{ required: true, message: '请选择租客' }]}
              >
                <Select
                  showSearch
                  placeholder="搜索姓名或公司名称"
                  optionFilterProp="label"
                  options={(tenants ?? []).map((t) => ({
                    value: t.id,
                    label: `${t.name}${t.contact_name ? `（${t.contact_name}）` : ''} · ${t.phone}`,
                  }))}
                />
              </Form.Item>

              <Form.Item name="property_type" label="租赁业态" rules={[{ required: true }]}>
                <Segmented
                  block
                  options={[
                    { value: 'factory', label: '厂房' },
                    { value: 'apartment', label: '公寓' },
                  ]}
                  onChange={(v) => {
                    setPropertyType(v as PropertyType)
                    form.setFieldsValue({ properties: [] })
                    setPreview(null)
                  }}
                />
              </Form.Item>

              <Form.Item
                name="properties"
                label={propertyType === 'factory' ? '关联厂房（支持分割多选）' : '关联公寓房间（支持多选）'}
                rules={[{ required: true, message: '请至少选择一个房源' }]}
              >
                <Select
                  mode="multiple"
                  showSearch
                  optionFilterProp="label"
                  placeholder="可多选，系统会自动汇总月租金与物业费"
                  options={propertyOptions}
                  onChange={() => runPreview()}
                />
              </Form.Item>
            </div>

            {/* 第 2 步：租期与费用 */}
            <div className={step === 1 ? 'block' : 'hidden'}>
              <Form.Item
                name="range"
                label="租期起止"
                rules={[{ required: true, message: '请选择租期' }]}
              >
                <DatePicker.RangePicker
                  className="w-full"
                  format="YYYY-MM-DD"
                  onChange={() => runPreview()}
                />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="pay_cycle"
                    label="缴费周期"
                    rules={[{ required: true, message: '请选择缴费周期' }]}
                  >
                    <Select
                      options={Object.entries(PAY_CYCLE).map(([value, label]) => ({ value, label }))}
                      onChange={() => runPreview()}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="deposit_amount"
                    label="押金金额（元）"
                    extra={
                      <button
                        type="button"
                        className="cursor-pointer text-[12px] text-[#0066CC] hover:underline disabled:cursor-not-allowed disabled:text-[#C7C7CC]"
                        disabled={!preview}
                        onClick={() => {
                          const monthly = preview?.monthlyRent ?? 0
                          form.setFieldsValue({
                            deposit_amount: Math.round(monthly * 2 * 100) / 100,
                          })
                        }}
                      >
                        {preview
                          ? `按 2 个月月租金填充（${money((preview.monthlyRent ?? 0) * 2)} 元）`
                          : '选择房源后可一键按 2 个月月租金填充'}
                      </button>
                    }
                  >
                    <InputNumber min={0} precision={2} className="w-full" placeholder="也可手工填写" />
                  </Form.Item>
                </Col>
              </Row>

              {preview && (
                <Alert
                  type="info"
                  showIcon
                  className="mb-4"
                  message={`系统核算月租金 ${money(preview.monthlyRent)} 元，月物业费 ${money(preview.monthlyPropertyFee)} 元`}
                  description="租金由房源面积与单价自动计算，确保账单口径与房源档案一致。"
                />
              )}
            </div>

            {/* 第 3 步：装修抵扣与条款 */}
            <div className={step === 2 ? 'block' : 'hidden'}>
              <Alert
                type="success"
                showIcon
                className="mb-5"
                message="装修费抵扣租金"
                description="录入装修总金额与抵扣期数后，系统会在前 N 期自动扣减当期租金，第 N+1 期起恢复全额。抵扣累计不会超过装修总金额。"
              />

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="decoration_total" label="装修总金额（元）">
                    <InputNumber
                      min={0}
                      precision={2}
                      className="w-full"
                      placeholder="0 表示不抵扣"
                      onChange={() => runPreview()}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="decoration_periods" label="抵扣期数">
                    <InputNumber
                      min={0}
                      precision={0}
                      className="w-full"
                      placeholder="如 6"
                      onChange={() => runPreview()}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="decoration_per_month"
                    label="每期抵扣额（元）"
                    extra="留空则按「总额 ÷ 期数」均摊"
                  >
                    <InputNumber
                      min={0}
                      precision={2}
                      className="w-full"
                      placeholder="留空自动均摊"
                      onChange={() => runPreview()}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="extra_clause" label="自定义附加条款">
                <Input.TextArea
                  rows={4}
                  placeholder="如：乙方装修方案须报甲方备案；退租时固定装修归甲方所有，可移动设备自行拆除。"
                />
              </Form.Item>
            </div>
          </Form>
        </div>

        {/* 右：实时试算面板 */}
        <div className="w-[420px] shrink-0">
          <div className="sticky top-0 rounded-2xl border border-black/[0.06] bg-[#FBFBFD] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[#1D1D1F]">每期应付试算</h3>
              {previewing && <span className="text-[12px] text-[#86868B]">计算中…</span>}
            </div>

            {!preview && (
              <EmptyHint
                title="等待录入"
                description="选择房源、租期与缴费周期后，这里会实时列出每期租金、装修抵扣与实付金额"
              />
            )}

            {preview && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white px-3.5 py-3">
                    <p className="text-[11.5px] text-[#86868B]">月租金</p>
                    <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#1D1D1F]">
                      {money(preview.monthlyRent)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white px-3.5 py-3">
                    <p className="text-[11.5px] text-[#86868B]">月物业费</p>
                    <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#1D1D1F]">
                      {money(preview.monthlyPropertyFee)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white px-3.5 py-3">
                    <p className="text-[11.5px] text-[#86868B]">每期抵扣</p>
                    <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#7C5CFF]">
                      {money(preview.decorationPerMonth)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white px-3.5 py-3">
                    <p className="text-[11.5px] text-[#86868B]">期数</p>
                    <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#1D1D1F]">
                      {preview.summary.periodCount} 期
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Tag bordered={false}>租金合计 {money(preview.summary.totalRent)}</Tag>
                  <Tag bordered={false} color="purple">
                    抵扣合计 {money(preview.summary.totalDecorationDeduction)}
                  </Tag>
                  <Tag bordered={false} color="blue">
                    应付合计 {money(preview.summary.totalPayable)}
                  </Tag>
                  {preview.summary.decorationRemainder > 0 && (
                    <Tag bordered={false} color="orange">
                      未抵扣完 {money(preview.summary.decorationRemainder)}
                    </Tag>
                  )}
                </div>

                <div className="mt-4 max-h-[420px] overflow-y-auto rounded-xl bg-white">
                  <Table
                    rowKey="periodIndex"
                    size="small"
                    pagination={false}
                    dataSource={planRows}
                    columns={[
                      {
                        title: '期次',
                        dataIndex: 'periodIndex',
                        width: 54,
                        render: (v: number, row) => (
                          <span
                            className={
                              row.decorationDeduction > 0
                                ? 'text-[12.5px] font-medium text-[#7C5CFF]'
                                : 'text-[12.5px] text-[#6E6E73]'
                            }
                          >
                            {v}
                          </span>
                        ),
                      },
                      {
                        title: '账期',
                        key: 'period',
                        render: (_v, row) => (
                          <span className="text-[11.5px] leading-4 text-[#86868B]">
                            {periodText(row.periodStart, row.periodEnd)}
                          </span>
                        ),
                      },
                      {
                        title: '抵扣',
                        dataIndex: 'decorationDeduction',
                        width: 84,
                        align: 'right',
                        render: (v: number) =>
                          v > 0 ? (
                            <span className="tabular-nums text-[12.5px] text-[#7C5CFF]">-{money(v)}</span>
                          ) : (
                            <span className="text-[12.5px] text-[#D2D2D7]">—</span>
                          ),
                      },
                      {
                        title: '应付',
                        dataIndex: 'payableAmount',
                        width: 96,
                        align: 'right',
                        render: (v: number) => (
                          <span className="tabular-nums text-[12.5px] font-medium text-[#1D1D1F]">
                            {money(v)}
                          </span>
                        ),
                      },
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  )
}
