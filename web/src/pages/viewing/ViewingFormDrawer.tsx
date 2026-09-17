import { useEffect, useMemo, useState } from 'react'
import { Button, Col, DatePicker, Drawer, Form, Input, Row, Segmented, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { feedback } from '../../api/feedback'
import { viewingApi } from '../../api/viewing'
import { apartmentApi, factoryApi, tenantApi } from '../../api/property'
import { useOptions } from '../../hooks'
import { VIEWING_STATUS, VIEWING_TRANSITIONS } from '../../utils/constants'
import { money } from '../../utils/format'
import type { PropertyType, Viewing, ViewingStatus } from '../../types'

interface Props {
  open: boolean
  record: Viewing | null
  onClose: () => void
  onSaved: () => void
}

interface FormValues {
  tenant_id?: number | null
  tenant_name: string
  phone: string
  property_type: PropertyType
  property_id?: number | null
  appoint_time?: Dayjs | null
  status: ViewingStatus
  remark?: string
}

const ALL_STATUS: ViewingStatus[] = ['pending', 'appointed', 'viewed', 'no_intent', 'signed']

/**
 * 看房预约登记表单。
 * 关联已有租客时自动带出姓名与电话；也可清空租客选择改为手工录入，
 * 两种方式共用同一份姓名/电话字段。
 */
export default function ViewingFormDrawer({ open, record, onClose, onSaved }: Props) {
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const [propertyType, setPropertyType] = useState<PropertyType>('factory')
  const isEdit = Boolean(record)

  const { options: tenants } = useOptions(() => tenantApi.options(), [open])
  const { options: factories } = useOptions(() => factoryApi.options(), [open])
  const { options: rooms } = useOptions(() => apartmentApi.roomOptions(), [open])

  useEffect(() => {
    if (!open) return
    if (record) {
      form.setFieldsValue({
        tenant_id: record.tenant_id ?? undefined,
        tenant_name: record.tenant_name,
        phone: record.phone,
        property_type: record.property_type,
        property_id: record.property_id ?? undefined,
        appoint_time: record.appoint_time ? dayjs(record.appoint_time) : null,
        status: record.status,
        remark: record.remark ?? '',
      })
      setPropertyType(record.property_type)
    } else {
      form.resetFields()
      form.setFieldsValue({
        property_type: 'factory',
        status: 'pending',
        appoint_time: dayjs().add(1, 'day').hour(10).minute(0).second(0),
      })
      setPropertyType('factory')
    }
  }, [open, record, form])

  const propertyOptions = useMemo(() => {
    if (propertyType === 'factory') {
      return (factories ?? []).map((f) => ({
        value: f.id,
        label: `${f.name}（${f.total_area}㎡ · ${f.rent_price} 元/㎡/月）`,
      }))
    }
    return (rooms ?? []).map((r) => ({
      value: r.id,
      label: `${r.code} · ${r.building_name} ${r.room_no} · ${money(r.monthly_rent)} 元/月`,
    }))
  }, [propertyType, factories, rooms])

  // 编辑态只列出「当前状态 + 允许流转到」的状态，避免提交后才被后端拒绝
  const statusOptions = useMemo(() => {
    const keys = isEdit && record ? [record.status, ...VIEWING_TRANSITIONS[record.status]] : ALL_STATUS
    return Array.from(new Set(keys)).map((key) => ({ value: key, label: VIEWING_STATUS[key].label }))
  }, [isEdit, record])

  const handleTenantChange = (tenantId?: number) => {
    const tenant = (tenants ?? []).find((t) => t.id === tenantId)
    if (!tenant) return
    form.setFieldsValue({ tenant_name: tenant.name, phone: tenant.phone })
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = {
        tenant_id: values.tenant_id ?? null,
        tenant_name: values.tenant_name.trim(),
        phone: values.phone.trim(),
        property_type: values.property_type,
        property_id: values.property_id ?? null,
        appoint_time: values.appoint_time ? values.appoint_time.format('YYYY-MM-DD HH:mm:ss') : null,
        status: values.status,
        remark: values.remark?.trim() || null,
      }

      if (isEdit && record) {
        await viewingApi.update(record.id, payload)
        feedback.success('看房预约已更新')
      } else {
        await viewingApi.create(payload)
        feedback.success('看房预约已登记')
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('[viewing] 保存失败:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      title={isEdit ? `编辑看房预约 · ${record?.tenant_name}` : '登记看房预约'}
      width={620}
      open={open}
      onClose={onClose}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {isEdit ? '保存修改' : '确认登记'}
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="tenant_id"
              label="关联租客档案"
              extra="选择后自动带出姓名与电话；留空则手工录入新客户信息"
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="从已有租客中选择（可选）"
                onChange={handleTenantChange}
                options={(tenants ?? []).map((t) => ({
                  value: t.id,
                  label: `${t.name}${t.contact_name ? ` · ${t.contact_name}` : ''} · ${t.phone}`,
                }))}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="tenant_name"
              label="租客姓名 / 公司名称"
              rules={[{ required: true, message: '请输入租客姓名或公司名称' }]}
            >
              <Input placeholder="如：杭州恒力精密机械有限公司" />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="phone"
              label="联系电话"
              rules={[
                { required: true, message: '请输入联系电话' },
                { pattern: /^1[3-9]\d{9}$|^0\d{2,3}-?\d{7,8}$/, message: '请填写有效的手机号或座机号' },
              ]}
            >
              <Input placeholder="如：13905710001" />
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item name="property_type" label="房源业态" rules={[{ required: true }]}>
              <Segmented
                onChange={(value) => {
                  setPropertyType(value as PropertyType)
                  form.setFieldsValue({ property_id: undefined })
                }}
                options={[
                  { value: 'factory', label: '厂房' },
                  { value: 'apartment', label: '公寓' },
                ]}
              />
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item name="property_id" label="意向房源">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={propertyType === 'factory' ? '选择意向厂房' : '选择意向公寓房间'}
                options={propertyOptions}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="appoint_time"
              label="预约看房时间"
              rules={[{ required: true, message: '请选择预约时间' }]}
            >
              <DatePicker showTime className="w-full" placeholder="选择日期与时间" />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item name="status" label="跟进状态" rules={[{ required: true }]}>
              <Select options={statusOptions} />
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item name="remark" label="需求备注">
              <Input.TextArea rows={3} placeholder="记录意向面积、预算、装修要求、预计入驻时间等" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Drawer>
  )
}
