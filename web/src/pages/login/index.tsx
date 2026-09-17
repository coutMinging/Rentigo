import { useEffect, useState } from 'react'
import { Button, Checkbox, Form, Input } from 'antd'
import { ArrowRight, KeyRound, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { feedback } from '../../api/feedback'
import { Brand } from '../../components/Logo'
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
  { label: '财务', username: 'finance' },
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
    /*
      整体结构：左右各半屏。
      上一版的毛病是「两栏都是纯白」——中间只剩一条看不见的发丝线，
      整屏 60% 是空白，页面像没做完的模板。
      现在改为「一深一浅」：左侧深墨色承载品牌与主张，成为整屏唯一的视觉锚点；
      右侧纯白只负责一件事——把账号密码填完。层级一眼可辨。
    */
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      {/* ---------- 左：深色品牌区（<lg 隐藏，改用右侧顶部的小标识） ---------- */}
      <section className="relative hidden flex-col overflow-hidden bg-[#101114] px-14 py-12 lg:flex xl:px-20">
        {/* 左上角一抹极轻的径向光，避免大面积纯黑发闷 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(120% 80% at 8% 0%, rgba(255,255,255,0.10), rgba(255,255,255,0) 60%)',
          }}
        />
        <div className="relative flex flex-1 flex-col">
          <Brand size={40} subtitle="厂房及公寓楼出租管理系统" onDark />

          {/* 主张区垂直居中，与右侧表单同处一条水平中线 */}
          <div className="flex flex-1 items-center">
            <div className="max-w-[430px] animate-rise">
              <p className="text-[11.5px] font-medium tracking-[0.2em] text-white/35">
                RENTIGO · 租赁管理
              </p>
              <h1 className="mt-4 text-[42px] font-semibold leading-[1.14] tracking-[-0.03em] text-white">
                租赁业务
                <br />
                一处管到底
              </h1>
              <p className="mt-6 text-[15px] leading-[1.9] text-white/55">
                房源、租客、租约、账单与报修全流程线上留痕，
                替代人工台账，规避错漏、到期遗忘与抵扣统计混乱。
              </p>

              {/* 用发丝线分隔条目，替代上一版散落的小圆点：形成稳定节奏，不再零碎 */}
              <div className="mt-10 space-y-5">
                {HIGHLIGHTS.map((item) => (
                  <div key={item.title} className="border-t border-white/10 pt-5">
                    <p className="text-[14px] font-medium text-white/90">{item.title}</p>
                    <p className="mt-1.5 text-[13px] leading-6 text-white/45">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-[12px] text-white/30">© 2026 Rentigo · 厂房及公寓楼出租管理系统</p>
        </div>
      </section>

      {/* ---------- 右：纯白表单区 ---------- */}
      <section className="flex flex-col px-8 py-12 lg:px-12 xl:px-16">
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-[384px] animate-fade">
            <Brand size={40} subtitle="厂房及公寓楼出租管理系统" className="mb-10 lg:hidden" />

            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">登录后台</h2>
            <p className="mt-2 text-[13.5px] leading-6 text-[#86868B]">请使用管理员分配的账号登录</p>

            {/* login-form：仅用于给输入框补上看得见的边界，见 index.css */}
            <Form
              form={form}
              layout="vertical"
              size="large"
              initialValues={{ remember: true, username: remembered, password: '' }}
              onFinish={handleSubmit}
              className="login-form mt-9"
              requiredMark={false}
            >
              <Form.Item
                name="username"
                label="账号"
                rules={[{ required: true, message: '请输入账号' }]}
              >
                <Input
                  prefix={<UserRound size={16} className="text-[#AEAEB2]" />}
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
                  prefix={<KeyRound size={16} className="text-[#AEAEB2]" />}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                />
              </Form.Item>

              <Form.Item name="remember" valuePropName="checked" className="!mb-6">
                <Checkbox>
                  <span className="text-[13px] text-[#6E6E73]">记住账号</span>
                </Checkbox>
              </Form.Item>

              {/* 箭头写在 children 里而不是 icon 属性，避免 loading 时按钮内容左右跳动 */}
              <Button type="primary" htmlType="submit" loading={logging} block className="!h-12">
                <span className="inline-flex items-center gap-2 text-[15px]">
                  登录
                  {!logging && <ArrowRight size={16} />}
                </span>
              </Button>
            </Form>

            {/* 演示账号：上一版是近乎全透明的灰块，字挤在一起像补丁；
                改为有边界的分组面板 + 可点击胶囊，一眼看清"账号是什么、点了会怎样" */}
            <div className="mt-8 rounded-2xl border border-black/[0.1] px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[12.5px] font-medium text-[#1D1D1F]">演示账号</p>
                <p className="text-[12px] text-[#86868B]">密码统一 123456</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((item) => (
                  <button
                    key={item.username}
                    type="button"
                    className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-black/[0.1] px-3 py-1.5 text-[12.5px] text-[#6E6E73] transition-colors hover:border-black/20 hover:bg-black/[0.02] hover:text-[#1D1D1F]"
                    onClick={() =>
                      form.setFieldsValue({ username: item.username, password: '123456' })
                    }
                  >
                    {item.label}
                    <span className="font-mono text-[12px] text-[#AEAEB2] transition-colors group-hover:text-[#0066CC]">
                      {item.username}
                    </span>
                  </button>
                ))}
              </div>

              <p className="mt-2.5 text-[11px] leading-4 text-[#AEAEB2]">
                点击任一账号自动填充，不同角色登录后可见菜单不同
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[384px]">
          <p className="text-[12px] text-[#AEAEB2]">登录遇到问题请联系系统管理员</p>
        </div>
      </section>
    </div>
  )
}
