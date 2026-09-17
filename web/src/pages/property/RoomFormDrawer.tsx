import { useEffect, useState } from 'react'
import { Button, Col, Drawer, Form, Input, InputNumber, Row, Select, Switch } from 'antd'
import { apartmentApi } from '../../api/property'
import { feedback } from '../../api/feedback'
import { LAYOUTS, ORIENTATIONS } from '../../utils/constants'
import type { Apartment, Building } from '../../types'

interface Props {
  open: boolean
  record: Apartment | null
  buildings: Building[]
  defaultBuildingId?: number
  onClose: () => void
  onSaved: () => void
}

/** 公寓房间表单：字段量适中，单列分组即可 */
export default function RoomFormDrawer({
  open,
  record,
  buildings,
  defaultBuildingId,
  onClose,
  onSaved,
}: Props) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(record)

  useEffect(() => {
    if (!open) return
    if (record) {
      form.setFieldsValue({
        ...record,
        has_elevator: record.has_elevator === 1,
        allow_pet: record.allow_pet === 1,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({
        building_id: defaultBuildingId,
        floor: 1,
        area: 32,
        monthly_rent: 1200,
        deposit_amount: 2400,
        property_fee: 120,
        water_price: 3.2,
        electric_price: 0.98,
        utility_type: 'civil',
        status: 'vacant',
        has_elevator: true,
        allow_pet: false,
      })
    }
  }, [open, record, defaultBuildingId, form])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload = {
      ...values,
      has_elevator: values.has_elevator ? 1 : 0,
      allow_pet: values.allow_pet ? 1 : 0,
    }

    setSaving(true)
    try {
      if (isEdit && record) {
        await apartmentApi.updateRoom(record.id, payload)
        feedback.success('房间信息已更新')
      } else {
        await apartmentApi.createRoom(payload)
        feedback.success('房间已新增')
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('[room] 保存失败:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      title={isEdit ? `编辑房间 · ${record?.code}` : '新增公寓房间'}
      width={640}
      open={open}
      onClose={onClose}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {isEdit ? '保存修改' : '确认新增'}
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="building_id" label="所属楼栋" rules={[{ required: true, message: '请选择楼栋' }]}>
              <Select
                placeholder="请选择"
                options={buildings.map((b) => ({ value: b.id, label: b.name }))}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="floor" label="楼层" rules={[{ required: true, message: '请输入楼层' }]}>
              <InputNumber min={1} precision={0} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="room_no" label="房间号" rules={[{ required: true, message: '请输入房间号' }]}>
              <Input placeholder="如 301" />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item name="layout" label="户型">
              <Select
                allowClear
                placeholder="请选择"
                options={LAYOUTS.map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="area" label="面积（㎡）">
              <InputNumber min={0} precision={1} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="orientation" label="朝向">
              <Select
                allowClear
                placeholder="请选择"
                options={ORIENTATIONS.map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item name="furniture" label="家具家电清单">
              <Input placeholder="如：床、衣柜、空调、热水器" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="has_elevator" label="电梯配置" valuePropName="checked">
              <Switch checkedChildren="有" unCheckedChildren="无" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="allow_pet" label="允许养宠" valuePropName="checked">
              <Switch checkedChildren="允许" unCheckedChildren="不允许" />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item name="occupancy_limit" label="入住人数上限">
              <InputNumber min={1} precision={0} className="w-full" placeholder="2" />
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
          <Col span={8}>
            <Form.Item name="status" label="房间状态">
              <Select
                options={[
                  { value: 'vacant', label: '空置' },
                  { value: 'rented', label: '已租' },
                  { value: 'repair', label: '待维修' },
                ]}
              />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item name="monthly_rent" label="月租金（元）" rules={[{ required: true, message: '请输入月租金' }]}>
              <InputNumber min={0} precision={2} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="deposit_amount" label="押金（元）">
              <InputNumber min={0} precision={2} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="property_fee" label="物业费（元）">
              <InputNumber min={0} precision={2} className="w-full" />
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

          <Col span={24}>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={2} placeholder="记录房间现状、注意事项等" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Drawer>
  )
}
