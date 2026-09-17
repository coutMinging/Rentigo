import { useEffect, useState } from 'react'
import { Alert, Col, Form, Input, InputNumber, Modal, Row, Select, Switch } from 'antd'
import { apartmentApi } from '../../api/property'
import { feedback } from '../../api/feedback'
import { LAYOUTS } from '../../utils/constants'
import type { Apartment, Building } from '../../types'

/** 批量录入：按「楼栋 + 楼层区间 + 每层间数」一次性生成房间 */
export function BatchCreateModal({
  open,
  buildings,
  defaultBuildingId,
  onClose,
  onSaved,
}: {
  open: boolean
  buildings: Building[]
  defaultBuildingId?: number
  onClose: () => void
  onSaved: () => void
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({
        building_id: defaultBuildingId,
        floor_from: 1,
        floor_to: 3,
        per_floor: 4,
        layout: '一室一卫',
        area: 32,
        monthly_rent: 1200,
        property_fee: 120,
        water_price: 3.2,
        electric_price: 0.98,
        utility_type: 'civil',
      })
    }
  }, [open, defaultBuildingId, form])

  const handleOk = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const result = await apartmentApi.batchCreate(values)
      feedback.success(`批量录入完成：新增 ${result.created} 间，跳过已存在 ${result.skipped} 间`)
      onSaved()
      onClose()
    } catch (err) {
      console.error('[apartment] 批量录入失败:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="批量录入房间"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="开始生成"
      width={560}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        className="mb-5"
        message="按楼层区间与每层间数自动生成房号"
        description="房号规则为「楼层 + 两位序号」，例如 1 层第 2 间为 102。已存在的房号会自动跳过，不会覆盖。"
      />
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="building_id" label="所属楼栋" rules={[{ required: true, message: '请选择楼栋' }]}>
              <Select options={buildings.map((b) => ({ value: b.id, label: b.name }))} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="floor_from" label="起始楼层" rules={[{ required: true, message: '必填' }]}>
              <InputNumber min={1} precision={0} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="floor_to" label="结束楼层" rules={[{ required: true, message: '必填' }]}>
              <InputNumber min={1} precision={0} className="w-full" />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item name="per_floor" label="每层间数" rules={[{ required: true, message: '必填' }]}>
              <InputNumber min={1} max={50} precision={0} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="layout" label="默认户型">
              <Select options={LAYOUTS.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="area" label="面积（㎡）">
              <InputNumber min={0} precision={1} className="w-full" />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item name="monthly_rent" label="月租金（元）" rules={[{ required: true, message: '必填' }]}>
              <InputNumber min={0} precision={2} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="property_fee" label="物业费（元）">
              <InputNumber min={0} precision={2} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="utility_type" label="水电性质">
              <Select
                options={[
                  { value: 'civil', label: '民用标准' },
                  { value: 'commercial', label: '商用标准' },
                ]}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item name="water_price" label="水费（元/吨）">
              <InputNumber min={0} precision={2} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="electric_price" label="电费（元/度）">
              <InputNumber min={0} precision={2} className="w-full" />
            </Form.Item>
          </Col>
        </Row>
        <p className="text-[12px] text-[#86868B]">押金按「月租金 × 2」自动计算，生成后可在批量修改中调整。</p>
      </Form>
    </Modal>
  )
}

/** 批量修改：对选中的房间统一改租金 / 押金 / 物业费 / 状态 */
export function BatchUpdateModal({
  open,
  rooms,
  onClose,
  onSaved,
}: {
  open: boolean
  rooms: Apartment[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) form.resetFields()
  }, [open, form])

  const handleOk = async () => {
    const values = await form.validateFields()
    const payload: Record<string, unknown> = { ids: rooms.map((r) => r.id) }
    let touched = 0

    for (const key of ['monthly_rent', 'deposit_amount', 'property_fee', 'status'] as const) {
      if (values[key] !== undefined && values[key] !== null && values[key] !== '') {
        payload[key] = values[key]
        touched += 1
      }
    }

    if (touched === 0) {
      feedback.warning('请至少填写一项要修改的内容')
      return
    }

    setSaving(true)
    try {
      const result = await apartmentApi.batchUpdate(payload)
      feedback.success(`已批量更新 ${result.updated} 个房间`)
      onSaved()
      onClose()
    } catch (err) {
      console.error('[apartment] 批量修改失败:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`批量修改 ${rooms.length} 个房间`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="确认修改"
      width={520}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        className="mb-5"
        message="只填写需要修改的字段，留空的项保持原值不变"
        description="批量修改会直接覆盖所选房间的对应参数，请确认选择范围正确。"
      />
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="monthly_rent" label="月租金（元）">
              <InputNumber min={0} precision={2} className="w-full" placeholder="不修改请留空" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="deposit_amount" label="押金（元）">
              <InputNumber min={0} precision={2} className="w-full" placeholder="不修改请留空" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="property_fee" label="物业费（元）">
              <InputNumber min={0} precision={2} className="w-full" placeholder="不修改请留空" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="status" label="房间状态">
              <Select
                allowClear
                placeholder="不修改请留空"
                options={[
                  { value: 'vacant', label: '空置' },
                  { value: 'rented', label: '已租' },
                  { value: 'repair', label: '待维修' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
      <div className="mt-2 max-h-[160px] overflow-y-auto rounded-xl bg-black/[0.025] px-4 py-3">
        <p className="mb-1.5 text-[12px] text-[#86868B]">已选房间</p>
        <div className="flex flex-wrap gap-1.5">
          {rooms.map((r) => (
            <span key={r.id} className="rounded-md bg-white px-2 py-[3px] text-[12px] text-[#6E6E73]">
              {r.code}
            </span>
          ))}
        </div>
      </div>
    </Modal>
  )
}

/** 楼栋表单 */
export function BuildingModal({
  open,
  record,
  onClose,
  onSaved,
}: {
  open: boolean
  record: Building | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (record) {
      form.setFieldsValue({ ...record, has_elevator: record.has_elevator === 1 })
    } else {
      form.resetFields()
      form.setFieldsValue({ floors: 3, has_elevator: true })
    }
  }, [open, record, form])

  const handleOk = async () => {
    const values = await form.validateFields()
    const payload = { ...values, has_elevator: values.has_elevator ? 1 : 0 }

    setSaving(true)
    try {
      if (record) {
        await apartmentApi.updateBuilding(record.id, payload)
        feedback.success('楼栋信息已更新')
      } else {
        await apartmentApi.createBuilding(payload)
        feedback.success('楼栋已新增，可继续批量录入房间')
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('[building] 保存失败:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={record ? '编辑楼栋' : '新增楼栋'}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      width={460}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label="楼栋名称" rules={[{ required: true, message: '请输入楼栋名称' }]}>
          <Input placeholder="如：员工公寓 3 号楼" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="floors" label="楼层数" rules={[{ required: true, message: '请输入楼层数' }]}>
              <InputNumber min={1} max={60} precision={0} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="has_elevator" label="电梯配置" valuePropName="checked">
              <Switch checkedChildren="有" unCheckedChildren="无" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="address" label="楼栋地址">
          <Input placeholder="如：杭州市萧山区智造园区生活区 3 号楼" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input placeholder="记录楼栋现状、管理要求等" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
