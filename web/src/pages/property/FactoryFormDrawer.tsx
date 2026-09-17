import { useEffect, useState } from 'react'
import { Button, Col, Divider, Drawer, Form, Input, InputNumber, Row, Select, Switch } from 'antd'
import { factoryApi } from '../../api/property'
import { feedback } from '../../api/feedback'
import { FIRE_RATINGS, FLOOR_TYPES } from '../../utils/constants'
import type { Factory } from '../../types'

interface Props {
  open: boolean
  record: Factory | null
  onClose: () => void
  onSaved: () => void
}

/**
 * 厂房表单抽屉。
 * 字段较多，按「基础信息 / 厂房参数 / 租赁参数 / 补充说明」分组，
 * 用区域标题而非折叠面板，减少一次点击成本。
 */
export default function FactoryFormDrawer({ open, record, onClose, onSaved }: Props) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(record)

  useEffect(() => {
    if (!open) return
    if (record) {
      form.setFieldsValue({
        ...record,
        has_crane: record.has_crane === 1,
        env_approved: record.env_approved === 1,
        independent_yard: record.independent_yard === 1,
        allow_sublet: record.allow_sublet === 1,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({
        total_area: 0,
        divisible_area: 0,
        rent_price: 0,
        property_fee: 0,
        min_lease_months: 12,
        status: 'vacant',
        has_crane: false,
        env_approved: false,
        independent_yard: false,
        allow_sublet: false,
      })
    }
  }, [open, record, form])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload = {
      ...values,
      has_crane: values.has_crane ? 1 : 0,
      env_approved: values.env_approved ? 1 : 0,
      independent_yard: values.independent_yard ? 1 : 0,
      allow_sublet: values.allow_sublet ? 1 : 0,
    }

    setSaving(true)
    try {
      if (isEdit && record) {
        await factoryApi.update(record.id, payload)
        feedback.success('厂房信息已更新')
      } else {
        await factoryApi.create(payload)
        feedback.success('厂房房源已新增')
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('[factory] 保存失败:', err)
    } finally {
      setSaving(false)
    }
  }

  const blockTitle = (text: string) => (
    <span className="text-[13px] font-semibold text-[#1D1D1F]">{text}</span>
  )

  return (
    <Drawer
      title={isEdit ? `编辑厂房 · ${record?.code}` : '新增厂房房源'}
      width={720}
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
      <Form form={form} layout="vertical" requiredMark={false} className="pb-4">
        <Divider orientation="left" orientationMargin={0} className="!mb-5 !mt-0">
          {blockTitle('基础信息')}
        </Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="name" label="房源名称" rules={[{ required: true, message: '请输入房源名称' }]}>
              <Input placeholder="如：A1 号标准厂房" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="status" label="房源状态" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'vacant', label: '待出租' },
                  { value: 'rented', label: '已出租' },
                  { value: 'disabled', label: '空置停用' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="address" label="详细地址" rules={[{ required: true, message: '请输入详细地址' }]}>
              <Input placeholder="如：杭州市萧山区智造园区兴业路 18 号 A1 幢" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="total_area" label="总建筑面积（㎡）" rules={[{ required: true, message: '请输入面积' }]}>
              <InputNumber min={0} precision={2} className="w-full" placeholder="3200" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="divisible_area" label="可分割面积（㎡）">
              <InputNumber min={0} precision={2} className="w-full" placeholder="0 表示不可分割" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" orientationMargin={0} className="!mb-5 !mt-2">
          {blockTitle('厂房专属参数')}
        </Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="floor_height" label="层高（m）">
              <InputNumber min={0} precision={1} className="w-full" placeholder="9" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="floor_load" label="地面承重（t/㎡）">
              <InputNumber min={0} precision={1} className="w-full" placeholder="3" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="transformer_capacity" label="变压器容量（kVA）">
              <InputNumber min={0} precision={0} className="w-full" placeholder="630" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="floor_type" label="地坪类型">
              <Select
                allowClear
                placeholder="请选择"
                options={FLOOR_TYPES.map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="fire_rating" label="消防等级">
              <Select
                allowClear
                placeholder="请选择"
                options={FIRE_RATINGS.map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="has_crane" label="有无行车" valuePropName="checked">
              <Switch checkedChildren="有" unCheckedChildren="无" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.has_crane !== next.has_crane}>
              {({ getFieldValue }) => (
                <Form.Item name="crane_tonnage" label="行车吨位（t）">
                  <InputNumber
                    min={0}
                    precision={1}
                    className="w-full"
                    placeholder="10"
                    disabled={!getFieldValue('has_crane')}
                  />
                </Form.Item>
              )}
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="env_approved" label="是否可环评" valuePropName="checked">
              <Switch checkedChildren="可" unCheckedChildren="否" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="independent_yard" label="是否独门独院" valuePropName="checked">
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="dorm_area" label="配套宿舍（㎡）">
              <InputNumber min={0} precision={2} className="w-full" placeholder="320" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="yard_area" label="空地面积（㎡）">
              <InputNumber min={0} precision={2} className="w-full" placeholder="800" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="truck_access" label="大车进出条件">
              <Input placeholder="如：可通行 17.5 米平板车，双向车道" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="forbidden_industry" label="禁止入驻行业">
              <Input placeholder="如：化工、喷漆、危化品仓储" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" orientationMargin={0} className="!mb-5 !mt-2">
          {blockTitle('租赁参数')}
        </Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="rent_price" label="租金单价（元/㎡/月）" rules={[{ required: true, message: '请输入租金单价' }]}>
              <InputNumber min={0} precision={2} className="w-full" placeholder="26" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="property_fee" label="物业费（元/㎡/月）">
              <InputNumber min={0} precision={2} className="w-full" placeholder="2.5" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="min_lease_months" label="最短租期（月）">
              <InputNumber min={0} precision={0} className="w-full" placeholder="12" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="water_price" label="水费（元/吨）">
              <InputNumber min={0} precision={2} className="w-full" placeholder="4.2" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="electric_price" label="电费（元/度）">
              <InputNumber min={0} precision={2} className="w-full" placeholder="1.05" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="allow_sublet" label="允许分割转租" valuePropName="checked">
              <Switch checkedChildren="允许" unCheckedChildren="不允许" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" orientationMargin={0} className="!mb-5 !mt-2">
          {blockTitle('补充说明')}
        </Divider>
        <Form.Item name="remark" label="房源说明">
          <Input.TextArea rows={3} placeholder="记录房源优势、注意事项等，便于带看时说明" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
