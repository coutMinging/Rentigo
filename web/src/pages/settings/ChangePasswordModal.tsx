import { useState } from 'react'
import { Button, Form, Input, Modal } from 'antd'
import { authApi } from '../../api/auth'
import { feedback } from '../../api/feedback'

interface Props {
  open: boolean
  onClose: () => void
}

interface FormValues {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

/** 修改当前登录账号的密码 */
export default function ChangePasswordModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)

  const handleOk = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      await authApi.changePassword(values.oldPassword, values.newPassword)
      feedback.success('密码已修改，请牢记新密码')
      form.resetFields()
      onClose()
    } catch (err) {
      console.error('[password] 修改失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="修改密码"
      open={open}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      footer={null}
      width={420}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleOk} className="pt-2" requiredMark={false}>
        <Form.Item
          name="oldPassword"
          label="原密码"
          rules={[{ required: true, message: '请输入原密码' }]}
        >
          <Input.Password placeholder="请输入当前使用的密码" />
        </Form.Item>

        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '密码至少 6 位' },
          ]}
        >
          <Input.Password placeholder="至少 6 位" />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator: (_rule, value) =>
                !value || getFieldValue('newPassword') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入的密码不一致')),
            }),
          ]}
        >
          <Input.Password placeholder="请再次输入新密码" />
        </Form.Item>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            onClick={() => {
              form.resetFields()
              onClose()
            }}
          >
            取消
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting}>
            确认修改
          </Button>
        </div>
      </Form>
    </Modal>
  )
}
