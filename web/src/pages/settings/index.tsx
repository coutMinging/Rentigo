import { useCallback, useEffect, useState } from 'react'
import { Button, Form, Input, Switch, Tabs } from 'antd'
import { Save } from 'lucide-react'
import { systemApi } from '../../api/system'
import { feedback } from '../../api/feedback'
import { PageCard, SectionTitle } from '../../components/Surface'
import { usePermission } from '../../hooks'
import type { Setting } from '../../types'
import { LogPanel, RolePanel, UserPanel } from './panels'

const BOOLEAN_KEYS = ['sms_enabled', 'esign_enabled']

/** 基础参数：租金单位、默认租期、押金规则、到期提醒天数、第三方接口开关 */
function BasicPanel() {
  const can = usePermission()
  const [settings, setSettings] = useState<Setting[]>([])
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    systemApi
      .settings()
      .then((rows) => {
        setSettings(rows)
        const values: Record<string, unknown> = {}
        for (const row of rows) {
          values[row.key] = BOOLEAN_KEYS.includes(row.key) ? row.value === 'true' : row.value
        }
        form.setFieldsValue(values)
      })
      .catch((err) => console.error('[settings] 加载失败:', err))
  }, [form])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    const values = await form.validateFields()
    const payload: Record<string, string> = {}
    for (const [key, value] of Object.entries(values)) {
      payload[key] = typeof value === 'boolean' ? String(value) : String(value ?? '')
    }

    setSaving(true)
    try {
      await systemApi.saveSettings(payload)
      feedback.success('系统参数已保存')
      load()
    } catch (err) {
      console.error('[settings] 保存失败:', err)
    } finally {
      setSaving(false)
    }
  }

  const labelOf = (key: string) => settings.find((s) => s.key === key)?.label ?? key

  return (
    <div className="pt-2">
      <SectionTitle
        title="基础参数"
        subtitle="影响账单计价口径与到期提醒，修改后对新生成的数据生效"
        extra={
          can('system', 'edit') ? (
            <Button type="primary" icon={<Save size={15} />} loading={saving} onClick={handleSave}>
              保存设置
            </Button>
          ) : undefined
        }
      />

      <Form form={form} layout="vertical" requiredMark={false} className="mt-6 max-w-[560px]">
        <Form.Item name="rent_unit" label={labelOf('rent_unit')} extra="仅作展示口径，不改变计算逻辑">
          <Input placeholder="元/㎡/月" />
        </Form.Item>

        <Form.Item
          name="default_lease_months"
          label={labelOf('default_lease_months')}
          extra="新建租约时租期的默认时长"
        >
          <Input placeholder="12" />
        </Form.Item>

        <Form.Item name="deposit_rule" label={labelOf('deposit_rule')} extra="如「押二付三」">
          <Input placeholder="押二付三" />
        </Form.Item>

        <Form.Item
          name="lease_warn_days"
          label={labelOf('lease_warn_days')}
          extra="租约到期前多少天开始高亮提醒并生成站内消息"
        >
          <Input placeholder="30" />
        </Form.Item>

        <div className="mt-6 border-t border-black/[0.06] pt-6">
          <p className="mb-1 text-[13px] font-medium text-[#1D1D1F]">第三方接口预留</p>
          <p className="mb-5 text-[12.5px] text-[#86868B]">
            接口对接端口已预留，开启后可在账单与租约页面触发对应通知
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-black/[0.06] px-4 py-3.5">
              <div>
                <p className="text-[13.5px] text-[#1D1D1F]">短信通知</p>
                <p className="mt-0.5 text-[12px] text-[#86868B]">
                  缴费提醒、租约到期提醒短信推送
                </p>
              </div>
              <Form.Item name="sms_enabled" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-black/[0.06] px-4 py-3.5">
              <div>
                <p className="text-[13.5px] text-[#1D1D1F]">电子签章</p>
                <p className="mt-0.5 text-[12px] text-[#86868B]">
                  合同在线签署与存证，当前使用浏览器打印导出 PDF
                </p>
              </div>
              <Form.Item name="esign_enabled" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </div>
          </div>
        </div>
      </Form>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-[#1D1D1F]">
          系统设置
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[#86868B]">
          基础参数、角色权限、账号与操作日志集中管理
        </p>
      </div>

      <PageCard>
        <Tabs
          items={[
            { key: 'basic', label: '基础参数', children: <BasicPanel /> },
            { key: 'roles', label: '角色权限', children: <RolePanel /> },
            { key: 'users', label: '账号管理', children: <UserPanel /> },
            { key: 'logs', label: '操作日志', children: <LogPanel /> },
          ]}
        />
      </PageCard>
    </div>
  )
}
