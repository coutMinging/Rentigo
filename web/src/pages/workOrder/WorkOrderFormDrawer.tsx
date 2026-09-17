import { useEffect, useMemo, useState } from 'react'
import { Button, Drawer, Form, Input, Segmented, Select, Upload } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import { ImagePlus, Loader2 } from 'lucide-react'
import { feedback } from '../../api/feedback'
import { apartmentApi, factoryApi } from '../../api/property'
import { uploadApi } from '../../api/upload'
import { workOrderApi, type WorkOrderPayload } from '../../api/workOrder'
import { useOptions } from '../../hooks'
import { money } from '../../utils/format'
import type { PropertyType, WorkOrder } from '../../types'

interface FormValues {
  property_type: PropertyType
  property_id?: number | null
  reporter: string
  phone?: string
  fault_desc: string
}

interface Props {
  open: boolean
  /** 传入则为编辑，否则为新建 */
  record: WorkOrder | null
  onClose: () => void
  onDone: () => void
}

const MAX_IMAGES = 6

export default function WorkOrderFormDrawer({ open, record, onClose, onDone }: Props) {
  const [form] = Form.useForm<FormValues>()
  const [propertyType, setPropertyType] = useState<PropertyType>('factory')
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { options: factories } = useOptions(() => factoryApi.options(), [open])
  const { options: apartmentRooms } = useOptions(() => apartmentApi.roomOptions(), [open])

  useEffect(() => {
    if (!open) return
    const type = record?.property_type ?? 'factory'
    setPropertyType(type)
    setFileList((record?.images ?? []).map((url, index) => ({
      uid: `existing-${index}`,
      name: url.split('/').pop() ?? `故障图片${index + 1}`,
      status: 'done',
      url,
    })))
    form.resetFields()
    form.setFieldsValue({
      property_type: type,
      property_id: record?.property_id ?? undefined,
      reporter: record?.reporter ?? '',
      phone: record?.phone ?? '',
      fault_desc: record?.fault_desc ?? '',
    })
  }, [open, record, form])

  const propertyOptions = useMemo(() => {
    if (propertyType === 'factory') {
      return (factories ?? []).map((item) => ({
        value: item.id,
        label: `${item.name}（${item.total_area}㎡ · ${item.rent_price} 元/㎡/月）`,
      }))
    }
    return (apartmentRooms ?? []).map((item) => ({
      value: item.id,
      label: `${item.code} · ${item.layout ?? '—'} · ${item.area}㎡ · ${money(item.monthly_rent)} 元/月`,
    }))
  }, [propertyType, factories, apartmentRooms])

  /** 走通用上传接口拿到可访问路径；返回 LIST_IGNORE 由本组件自行维护文件列表 */
  const handleBeforeUpload = (file: File) => {
    setUploading(true)
    uploadApi
      .files('workorder', [file])
      .then((res) => {
        const uploaded = res.files[0]
        if (!uploaded) return
        setFileList((prev) => [
          ...prev,
          { uid: `${Date.now()}-${file.name}`, name: uploaded.name, status: 'done', url: uploaded.url },
        ])
      })
      .catch((err) => console.error('[workOrder] 故障图片上传失败:', err))
      .finally(() => setUploading(false))

    return Upload.LIST_IGNORE
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: WorkOrderPayload = {
      property_type: values.property_type,
      property_id: values.property_id ?? null,
      reporter: values.reporter.trim(),
      phone: values.phone?.trim() || null,
      fault_desc: values.fault_desc.trim(),
      images: fileList.map((item) => item.url).filter((url): url is string => Boolean(url)),
    }

    setSubmitting(true)
    try {
      if (record) {
        await workOrderApi.update(record.id, payload)
        feedback.success(`工单 ${record.order_no} 已更新`)
      } else {
        const result = await workOrderApi.create(payload)
        feedback.success(`工单 ${result.order_no} 已创建，请及时派单`)
      }
      onDone()
      onClose()
    } catch (err) {
      console.error('[workOrder] 保存失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer
      title={record ? `编辑工单 ${record.order_no}` : '新建报修工单'}
      width={600}
      open={open}
      onClose={onClose}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[#86868B]">
            工单号由系统自动生成，创建后状态为「待派单」
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              {record ? '保存修改' : '提交报修'}
            </Button>
          </div>
        </div>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="property_type" label="报修业态" rules={[{ required: true }]}>
          <Segmented
            block
            options={[
              { value: 'factory', label: '厂房' },
              { value: 'apartment', label: '公寓' },
            ]}
            onChange={(v) => {
              setPropertyType(v as PropertyType)
              form.setFieldsValue({ property_id: undefined })
            }}
          />
        </Form.Item>

        <Form.Item
          name="property_id"
          label={propertyType === 'factory' ? '报修厂房（可选）' : '报修房间（可选）'}
          extra="未关联具体房源时，仅按业态登记"
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="搜索并选择房源"
            options={propertyOptions}
          />
        </Form.Item>

        <div className="grid grid-cols-2 gap-4">
          <Form.Item
            name="reporter"
            label="报修人"
            rules={[{ required: true, message: '请输入报修人' }]}
          >
            <Input placeholder="如：陈建国" maxLength={30} />
          </Form.Item>
          <Form.Item name="phone" label="联系电话">
            <Input placeholder="如：13905710001" maxLength={20} />
          </Form.Item>
        </div>

        <Form.Item
          name="fault_desc"
          label="故障描述"
          rules={[{ required: true, message: '请描述故障情况' }]}
        >
          <Input.TextArea
            rows={4}
            maxLength={300}
            showCount
            placeholder="请说明故障位置、现象与影响，如：车间 3 号行车限位开关失灵，起升到顶后无法自动断电。"
          />
        </Form.Item>

        <Form.Item
          label="故障图片"
          extra={`最多 ${MAX_IMAGES} 张，支持 jpg / png / webp，单张不超过 10MB`}
        >
          <Upload
            listType="picture-card"
            accept="image/*"
            multiple
            fileList={fileList}
            beforeUpload={handleBeforeUpload}
            onRemove={(file) => setFileList((prev) => prev.filter((item) => item.uid !== file.uid))}
          >
            {fileList.length >= MAX_IMAGES ? null : (
              <div className="flex flex-col items-center gap-1.5 text-[#6E6E73]">
                {uploading ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <ImagePlus size={17} />
                )}
                <span className="text-[12px]">上传</span>
              </div>
            )}
          </Upload>
        </Form.Item>
      </Form>
    </Drawer>
  )
}
