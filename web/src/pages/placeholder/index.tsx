import { useNavigate } from 'react-router-dom'
import { Button } from 'antd'
import { ArrowLeft, CheckCircle2, CircleDashed } from 'lucide-react'
import { PageCard, SectionTitle } from '../../components/Surface'

/**
 * 占位模块框架页。
 * 本期只交付核心 5 模块，看房预约与报修工单的数据表已建好，
 * 这里明确列出规划功能与已就绪的数据结构，便于下一阶段直接开工。
 */
const MODULE_CONTENT: Record<
  string,
  {
    title: string
    subtitle: string
    planned: string[]
    ready: string[]
  }
> = {
  viewing: {
    title: '看房预约管理',
    subtitle: '登记看房需求、跟进议价与转签约，记录永久存档',
    planned: [
      '手动登记看房需求：选择房源、预约时间、租客联系方式与需求备注',
      '看房状态流转：待确认 → 已预约 → 已看房 → 无意向 / 转为签约',
      '录入跟进记录：议价过程、装修抵扣洽谈、租期沟通等',
      '全部看房记录支持查询与导出',
    ],
    ready: ['viewings 数据表已建好（含状态、预约时间、备注字段）', '只读列表接口 GET /api/system/viewings 已可用'],
  },
  workOrder: {
    title: '报修工单管理',
    subtitle: '从报修受理到完工关闭的闭环管理，统计维修频次与成本',
    planned: [
      '工单新建：关联厂房区域或公寓房间，录入报修人、故障描述与故障图片',
      '工单流转：待派单 → 维修中 → 已完工 → 已关闭',
      '指派维修人员，录入维修进度、维修费用与完工备注',
      '工单存档，支持按房源统计维修频次与维修成本',
    ],
    ready: ['work_orders 数据表已建好（含派单人、费用、进度字段）', '只读列表接口 GET /api/system/work-orders 已可用'],
  },
}

export default function PlaceholderPage({ moduleKey }: { moduleKey: string }) {
  const navigate = useNavigate()
  const content = MODULE_CONTENT[moduleKey]

  if (!content) return null

  return (
    <div className="space-y-5">
      <PageCard className="!p-8">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-black/[0.045] px-3 py-1 text-[12px] text-[#6E6E73]">
            <CircleDashed size={13} />
            下一阶段功能
          </div>
          <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-[#1D1D1F]">
            {content.title}
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-[#6E6E73]">{content.subtitle}</p>
          <p className="mt-5 text-[13px] leading-6 text-[#86868B]">
            本期优先交付房源、租客、租约、财务与看板五个核心模块。
            该模块的数据库结构与只读接口已经就绪，界面开发可以直接在现有骨架上继续。
          </p>
          <div className="mt-7 flex gap-3">
            <Button type="primary" onClick={() => navigate('/dashboard')}>
              返回数据看板
            </Button>
            <Button icon={<ArrowLeft size={15} />} onClick={() => navigate(-1)}>
              返回上一页
            </Button>
          </div>
        </div>
      </PageCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PageCard>
          <SectionTitle title="规划功能清单" subtitle="来自需求文档的功能拆解" />
          <ul className="mt-5 space-y-3.5">
            {content.planned.map((text) => (
              <li key={text} className="flex gap-3">
                <CircleDashed size={15} className="mt-[3px] shrink-0 text-[#C7C7CC]" />
                <span className="text-[13.5px] leading-6 text-[#6E6E73]">{text}</span>
              </li>
            ))}
          </ul>
        </PageCard>

        <PageCard>
          <SectionTitle
            title="已就绪的基础设施"
            subtitle="数据层与接口已打通，界面可直接接入"
          />
          <ul className="mt-5 space-y-3.5">
            {content.ready.map((text) => (
              <li key={text} className="flex gap-3">
                <CheckCircle2 size={15} className="mt-[3px] shrink-0 text-[#1D9A4E]" />
                <span className="text-[13.5px] leading-6 text-[#6E6E73]">{text}</span>
              </li>
            ))}
          </ul>
        </PageCard>
      </div>
    </div>
  )
}
