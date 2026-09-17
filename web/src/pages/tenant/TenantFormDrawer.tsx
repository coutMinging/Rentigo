import { useEffect, useState } from 'react'
import { Button, Col, Drawer, Form, Input, Row, Select } from 'antd'
import { tenantApi } from '../../api/property'
import { feedback } from '../../api/feedback'
import { TENANT_TAG } from '../../utils/constants'
import type { Tenant } from '../../types'

interface Props {
  open: boolean
  record: Tenant | null
  onClose: () => void
  onSaved: () => void
}

/** 租客档案表单：个人与企业两类，字段按类型动态切换 */
export default function TenantFormDrawer({ open, record, onClose, onSaved }: Props) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<'person' | 'company'>('person')
  const isEdit = Boolean(record)

  useEffect(() => {
    if (!open) return
    if (record) {
      form.setFieldsValue({ ...record, tags: record.manual_tags ?? record.tags ?? [] })
      setType(record.type)
    } else {
      form.resetFields()
      form.setFieldsValue({ type: 'person', tags: ['intent'] })
      setType('person')
    }
  }, [open, record, form])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (isEdit && record) {
        await tenantApi.update(record.id, values)
        feedback.success('租客档案已更新')
      } else {
        await tenantApi.create(values)
        feedback.success('租客档案已新增')
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('[tenant] 保存失败:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      title={isEdit ? `编辑租客 · ${record?.name}` : '新增租客档案'}
      width={600}
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
          <Col span={24}>
            <Form.Item name="type" label="租客类型" rules={[{ required: true }]}>
              <Select
                onChange={(v: 'person' | 'company') => setType(v)}
                options={[
                  { value: 'person', label: '个人租客' },
                  { value: 'company', label: '企业租客' },
                ]}
              />
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item
              name="name"
              label={type === 'company' ? '公司名称' : '姓名'}
              rules={[{ required: true, message: type === 'company' ? '请输入公司名称' : '请输入姓名' }]}
            >
              <Input placeholder={type === 'company' ? '如：杭州恒力精密机械有限公司' : '如：周晓东'} />
            </Form.Item>
          </Col>

          {type === 'company' && (
            <Col span={24}>
              <Form.Item
                name="contact_name"
                label="联系人"
                rules={[{ required: true, message: '企业租客需填写联系人' }]}
              >
                <Input placeholder="如：陈建国" />
              </Form.Item>
            </Col>
          )}

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

          <Col span={12}>
            <Form.Item
              name="id_card"
              label={type === 'company' ? '统一社会信用代码' : '身份证号'}
            >
              <Input placeholder={type === 'company' ? '91330109MA2AB10001' : '330109199203151234'} />
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item
              name="tags"
              label="租客标签"
              extra="「已签约 / 待续租 / 欠费」会根据租约与账单自动计算，无需手动勾选"
            >
              <Select
                mode="multiple"
                allowClear
                placeholder="可选择意向标签"
                options={[
                  { value: 'intent', label: TENANT_TAG.intent.label },
                  { value: 'signed', label: TENANT_TAG.signed.label },
                  { value: 'arrears', label: TENANT_TAG.arrears.label },
                  { value: 'renew', label: TENANT_TAG.renew.label },
                ]}
              />
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item name="address" label="联系地址">
              <Input placeholder="如：萧山区智造园区生活区 1 号楼 201" />
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} placeholder="记录租客背景、信用情况、沟通要点等" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Drawer>
  )
}
