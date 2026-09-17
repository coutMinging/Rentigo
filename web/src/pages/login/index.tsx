import { useEffect, useState } from 'react'
import { Button, Checkbox, Form, Input } from 'antd'
import { ArrowRight, KeyRound, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { feedback } from '../../api/feedback'
import { useAuthStore } from '../../store/auth'

interface LoginForm {
  username: string
  password: string
  remember: boolean
}

const HIGHLIGHTS = [
  {
    title: '厂房 · 公寓双业态',
    desc: '工业参数与居住参数分开建档，楼层房号三级管理',
  },
  {
    title: '装修费抵扣租金',
    desc: '录入装修总额与抵扣期数，每期实付租金自动核算',
  },
  {
    title: '账单与台账自动化',
    desc: '按缴费周期生成账单，逾期高亮，业态收入独立核算',
  },
]

const DEMO_ACCOUNTS = [
  { label: '超级管理员', username: 'admin' },
  { label: '财务人员', username: 'finance' },
  { label: '物业运维', username: 'ops' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const logging = useAuthStore((state) => state.logging)
  const [form] = Form.useForm<LoginForm>()

  // 记住账号：仅存用户名，密码始终不落盘
  const [remembered] = useState(() => localStorage.getItem('farental_last_user') ?? '')

  useEffect(() => {
    if (remembered) form.setFieldsValue({ username: remembered, remember: true })
  }, [remembered, form])

  const handleSubmit = async (values: LoginForm) => {
    try {
      await login(values.username.trim(), values.password)
      if (values.remember) {
        localStorage.setItem('farental_last_user', values.username.trim())
      } else {
        localStorage.removeItem('farental_last_user')
      }
      feedback.success('登录成功，欢迎回来')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error('[login] 登录失败:', err)
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* 左侧品牌区：纯白 + 大留白，模仿苹果官网的克制排版 */}
      <div className="relative hidden w-1/2 flex-col justify-center px-20 lg:flex">
        <div className="absolute inset-y-0 right-0 w-px bg-black/[0.06]" />
        <div className="max-w-[440px] animate-rise">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D1D1F] text-[15px] font-semibold text-white">
              FA
            </div>
            <div>
              <p className="text-[15px] font-semibold leading-5 text-[#1D1D1F]">
                厂房及公寓楼出租管理系统
              </p>
              <p className="text-[12px] text-[#86868B]">Factory & Apartment Rental Console</p>
            </div>
          </div>

          <h1 className="text-[40px] font-semibold leading-[1.15] tracking-tight text-[#1D1D1F]">
            租赁业务
            <br />
            一处管到底
          </h1>
          <p className="mt-5 text-[15px] leading-7 text-[#6E6E73]">
            房源、租客、租约、账单与报修全流程线上留痕，
            替代人工台账，规避错漏、到期遗忘与抵扣统计混乱。
          </p>

          <div className="mt-12 space-y-7">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="flex gap-4">
                <div className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1D1D1F]" />
                <div>
                  <p className="text-[14.5px] font-semibold text-[#1D1D1F]">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-6 text-[#86868B]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="flex w-full items-center justify-center px-8 lg:w-1/2">
        <div className="w-full max-w-[380px] animate-fade">
          <div className="mb-9 lg:hidden">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D1D1F] text-[15px] font-semibold text-white">
              FA
            </div>
            <h1 className="text-[24px] font-semibold tracking-tight text-[#1D1D1F]">
              厂房及公寓楼出租管理系统
            </h1>
          </div>

          <h2 className="text-[24px] font-semibold tracking-tight text-[#1D1D1F]">登录后台</h2>
          <p className="mt-2 text-[13px] text-[#86868B]">请使用管理员分配的账号登录</p>

          <Form
            form={form}
            layout="vertical"
            size="large"
            initialValues={{ remember: true, username: remembered, password: '' }}
            onFinish={handleSubmit}
            className="mt-8"
            requiredMark={false}
          >
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, message: '请输入账号' }]}
            >
              <Input
                prefix={<UserRound size={15} className="text-[#AEAEB2]" />}
                placeholder="请输入账号"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<KeyRound size={15} className="text-[#AEAEB2]" />}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item name="remember" valuePropName="checked" className="!mb-5">
              <Checkbox>
                <span className="text-[13px] text-[#6E6E73]">记住账号</span>
              </Checkbox>
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              loading={logging}
              block
              size="large"
              icon={!logging ? <ArrowRight size={16} /> : undefined}
              iconPosition="end"
              className="!h-[46px]"
            >
              登录
            </Button>
          </Form>

          <div className="mt-8 rounded-2xl bg-black/[0.025] px-4 py-3.5">
            <p className="mb-2 text-[12px] font-medium text-[#6E6E73]">演示账号（密码均为 123456）</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {DEMO_ACCOUNTS.map((item) => (
                <button
                  key={item.username}
                  type="button"
                  className="cursor-pointer text-left text-[12px] text-[#0066CC] hover:underline"
                  onClick={() =>
                    form.setFieldsValue({ username: item.username, password: '123456' })
                  }
                >
                  {item.label}：{item.username}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-[#AEAEB2]">
              点击账号可自动填充，不同角色登录后可见菜单不同
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
