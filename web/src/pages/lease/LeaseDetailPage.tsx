import { useCallback, useEffect, useState } from 'react'
import { Button, Descriptions, Skeleton, Table, Tabs, Tag, Tooltip } from 'antd'
import { ArrowLeft, FileSignature, Printer, RefreshCw, TriangleAlert } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { leaseApi } from '../../api/lease'
import { feedback } from '../../api/feedback'
import { MoneyText } from '../../components/DataDisplay'
import { PageCard, SectionTitle } from '../../components/Surface'
import { StatusTag } from '../../components/StatusTag'
import { usePermission } from '../../hooks'
import { BILL_STATUS, DEPOSIT_TYPE, LEASE_STATUS, PAY_CYCLE, PAY_METHOD, PROPERTY_TYPE } from '../../utils/constants'
import { dateText, daysLeftText, money, periodText } from '../../utils/format'
import type { LeaseDetail, LeaseStatus } from '../../types'
import ContractModal from './ContractModal'
import SettlementModal from './SettlementModal'

export default function LeaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const can = usePermission()
  const leaseId = Number(id)

  const [detail, setDetail] = useState<LeaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [contractOpen, setContractOpen] = useState(false)
  const [settlementOpen, setSettlementOpen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const load = useCallback(() => {
    if (!leaseId) return
    setLoading(true)
    leaseApi
      .detail(leaseId)
      .then(setDetail)
      .catch((err) => console.error('[lease] 详情加载失败:', err))
      .finally(() => setLoading(false))
  }, [leaseId])

  useEffect(() => {
    load()
  }, [load])

  const handleRegenerate = async () => {
    const confirmed = await feedback.confirm(
      '重新生成账单',
      '将按当前租期与装修抵扣参数重算全部期次账单。若已有收款流水，系统会拒绝执行，以免对账错乱。',
    )
    if (!confirmed) return

    setRegenerating(true)
    try {
      const result = await leaseApi.regenerateBills(leaseId)
      feedback.success(`已重新生成 ${result.count} 期账单`)
      load()
    } catch (err) {
      console.error('[lease] 重新生成失败:', err)
    } finally {
      setRegenerating(false)
    }
  }

  const handleBreach = async () => {
    const confirmed = await feedback.confirm(
      '标记解约欠费',
      '适用于租客失联或恶意欠费的场景。标记后租约状态变为「解约欠费」，关联房源会被释放。',
    )
    if (!confirmed) return

    try {
      await leaseApi.markBreach(leaseId, '租客逾期欠费且联系不上，按解约欠费处理')
      feedback.success('已标记为解约欠费')
      load()
    } catch (err) {
      console.error('[lease] 标记失败:', err)
    }
  }

  if (loading && !detail) {
    return (
      <PageCard>
        <Skeleton active paragraph={{ rows: 10 }} />
      </PageCard>
    )
  }

  if (!detail) {
    return (
      <PageCard>
        <div className="py-12 text-center">
          <p className="text-[14px] text-[#6E6E73]">租约不存在或已被删除</p>
          <Button className="mt-4" onClick={() => navigate('/leases')}>
            返回租约列表
          </Button>
        </div>
      </PageCard>
    )
  }

  const { lease, items, bills, payments, deposits, decoration_plan, summary } = detail
  const statusMeta = LEASE_STATUS[lease.status]
  const editable = lease.status === 'active' || lease.status === 'expiring'

  return (
    <div className="space-y-5">
      {/* 头部 */}
      <PageCard>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <button
              type="button"
              className="mb-3 flex cursor-pointer items-center gap-1.5 text-[12.5px] text-[#86868B] hover:text-[#1D1D1F]"
              onClick={() => navigate('/leases')}
            >
              <ArrowLeft size={14} />
              返回租约列表
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[24px] font-semibold leading-8 tracking-tight text-[#1D1D1F]">
                {lease.lease_no}
              </h1>
              <StatusTag meta={statusMeta} />
              <Tag bordered={false}>{PROPERTY_TYPE[lease.property_type]}</Tag>
              <Tag bordered={false}>{PAY_CYCLE[lease.pay_cycle]}</Tag>
            </div>
            <p className="mt-2.5 text-[13.5px] text-[#6E6E73]">
              {lease.tenant_name} ·{' '}
              {lease.status === 'expiring'
                ? daysLeftText(
                    Math.ceil(
                      (new Date(lease.end_date).getTime() - new Date().getTime()) / 86400000,
                    ),
                  )
                : `${dateText(lease.start_date)} ~ ${dateText(lease.end_date)}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button icon={<Printer size={15} />} onClick={() => setContractOpen(true)}>
              合同预览
            </Button>
            {can('lease', 'edit') && (
              <>
                <Tooltip title="租金或抵扣参数变更后使用">
                  <Button
                    icon={<RefreshCw size={15} />}
                    loading={regenerating}
                    disabled={!editable}
                    onClick={handleRegenerate}
                  >
                    重新生成账单
                  </Button>
                </Tooltip>
                <Button
                  danger
                  icon={<TriangleAlert size={15} />}
                  disabled={!editable}
                  onClick={handleBreach}
                >
                  标记解约欠费
                </Button>
                <Button
                  type="primary"
                  icon={<FileSignature size={15} />}
                  disabled={!editable}
                  onClick={() => setSettlementOpen(true)}
                >
                  办理退租
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 金额概览 */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-black/[0.06] pt-5 lg:grid-cols-5">
          {[
            { label: '月租金', value: money(lease.monthly_rent) },
            { label: '月物业费', value: money(lease.monthly_property_fee) },
            { label: '押金', value: money(lease.deposit_amount) },
            { label: '累计应收', value: money(summary.payable_total) },
            { label: '累计实收', value: money(summary.paid_total) },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-[12px] text-[#86868B]">{item.label}</p>
              <p className="mt-1.5 text-[17px] font-semibold tabular-nums text-[#1D1D1F]">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {summary.owed_total > 0 && (
          <div className="mt-4 rounded-xl bg-[rgba(215,0,21,0.05)] px-4 py-3 text-[13px] text-[#D70015]">
            该租约当前欠费 <b>{money(summary.owed_total)}</b> 元，共 {bills.filter((b) => b.outstanding > 0).length} 期账单未结清
          </div>
        )}
      </PageCard>

      {/* 明细 */}
      <PageCard>
        <Tabs
          items={[
            {
              key: 'info',
              label: '基本信息',
              children: (
                <div className="space-y-6 pt-2">
                  <Descriptions column={3} size="small" colon={false}>
                    <Descriptions.Item label="租客">{lease.tenant_name}</Descriptions.Item>
                    <Descriptions.Item label="联系电话">{lease.tenant_phone}</Descriptions.Item>
                    <Descriptions.Item label="租客类型">
                      {lease.tenant_type === 'company' ? '企业租客' : '个人租客'}
                    </Descriptions.Item>
                    <Descriptions.Item label="租期开始">{dateText(lease.start_date)}</Descriptions.Item>
                    <Descriptions.Item label="租期结束">{dateText(lease.end_date)}</Descriptions.Item>
                    <Descriptions.Item label="签约日期">{dateText(lease.sign_date)}</Descriptions.Item>
                    <Descriptions.Item label="缴费周期">
                      {PAY_CYCLE[lease.pay_cycle]}
                    </Descriptions.Item>
                    <Descriptions.Item label="押金">{money(lease.deposit_amount)} 元</Descriptions.Item>
                    <Descriptions.Item label="装修总金额">
                      {money(lease.decoration_total)} 元
                    </Descriptions.Item>
                    <Descriptions.Item label="抵扣期数">
                      {lease.decoration_periods} 期
                    </Descriptions.Item>
                    <Descriptions.Item label="每期抵扣">
                      {money(lease.decoration_per_month)} 元
                    </Descriptions.Item>
                    <Descriptions.Item label="累计已抵扣">
                      {money(lease.decoration_deducted)} 元
                    </Descriptions.Item>
                    {lease.terminate_date && (
                      <>
                        <Descriptions.Item label="退租日期">
                          {dateText(lease.terminate_date)}
                        </Descriptions.Item>
                        <Descriptions.Item label="退租原因" span={2}>
                          {lease.terminate_reason ?? '—'}
                        </Descriptions.Item>
                      </>
                    )}
                    <Descriptions.Item label="附加条款" span={3}>
                      {lease.extra_clause ?? '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="备注" span={3}>
                      {lease.remark ?? '—'}
                    </Descriptions.Item>
                  </Descriptions>

                  <div>
                    <SectionTitle
                      title="关联房源"
                      subtitle={`共 ${items.length} 处，租金由房源面积与单价自动核算`}
                    />
                    <Table
                      rowKey="id"
                      size="small"
                      className="mt-4"
                      pagination={false}
                      dataSource={items}
                      columns={[
                        { title: '业态', dataIndex: 'property_type', width: 90, render: (v) => PROPERTY_TYPE[v as 'factory'] },
                        { title: '房源', dataIndex: 'property_name' },
                        {
                          title: '月租金',
                          dataIndex: 'monthly_rent',
                          width: 130,
                          align: 'right',
                          render: (v: number) => <MoneyText value={v} strong />,
                        },
                        {
                          title: '月物业费',
                          dataIndex: 'monthly_property_fee',
                          width: 130,
                          align: 'right',
                          render: (v: number) => <MoneyText value={v} tone="muted" />,
                        },
                      ]}
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'bills',
              label: `账单 (${bills.length})`,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  className="pt-2"
                  dataSource={bills}
                  pagination={{ pageSize: 12, showSizeChanger: false }}
                  rowClassName={(r) => (r.is_overdue ? 'bg-[rgba(215,0,21,0.025)]' : '')}
                  columns={[
                    { title: '期次', dataIndex: 'period_index', width: 60 },
                    { title: '账单号', dataIndex: 'bill_no', width: 190 },
                    {
                      title: '账期',
                      key: 'period',
                      width: 200,
                      render: (_v, r) => (
                        <span className="text-[12.5px] text-[#6E6E73]">
                          {periodText(r.period_start, r.period_end)}
                        </span>
                      ),
                    },
                    { title: '应交日期', dataIndex: 'due_date', width: 110 },
                    {
                      title: '租金',
                      dataIndex: 'rent_amount',
                      width: 110,
                      align: 'right',
                      render: (v: number) => <MoneyText value={v} />,
                    },
                    {
                      title: '装修抵扣',
                      dataIndex: 'decoration_deduction',
                      width: 110,
                      align: 'right',
                      render: (v: number) =>
                        v > 0 ? (
                          <span className="tabular-nums text-[13px] text-[#7C5CFF]">-{money(v)}</span>
                        ) : (
                          <span className="text-[#D2D2D7]">—</span>
                        ),
                    },
                    {
                      title: '应收',
                      dataIndex: 'payable_amount',
                      width: 110,
                      align: 'right',
                      render: (v: number) => <MoneyText value={v} strong />,
                    },
                    {
                      title: '实收',
                      dataIndex: 'paid_amount',
                      width: 110,
                      align: 'right',
                      render: (v: number) => <MoneyText value={v} tone="muted" />,
                    },
                    {
                      title: '欠费',
                      dataIndex: 'outstanding',
                      width: 110,
                      align: 'right',
                      render: (v: number) =>
                        v > 0 ? (
                          <MoneyText value={v} tone="danger" strong />
                        ) : (
                          <span className="text-[#AEAEB2]">—</span>
                        ),
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      width: 110,
                      align: 'center',
                      render: (v) => <StatusTag meta={BILL_STATUS[v as 'pending']} />,
                    },
                  ]}
                />
              ),
            },
            {
              key: 'decoration',
              label: `装修抵扣计划 (${decoration_plan.length})`,
              children:
                decoration_plan.length === 0 ? (
                  <p className="py-10 text-center text-[13px] text-[#AEAEB2]">
                    该租约未设置装修费抵扣
                  </p>
                ) : (
                  <div className="pt-2">
                    <div className="mb-4 rounded-xl bg-[#FBFBFD] px-4 py-3 text-[13px] text-[#6E6E73]">
                      装修总金额 <b>{money(lease.decoration_total)}</b> 元，分{' '}
                      <b>{lease.decoration_periods}</b> 期抵扣，每期扣减{' '}
                      <b>{money(lease.decoration_per_month)}</b> 元，累计已抵扣{' '}
                      <b>{money(lease.decoration_deducted)}</b> 元。
                    </div>
                    <Table
                      rowKey="period_index"
                      size="small"
                      pagination={false}
                      dataSource={decoration_plan}
                      columns={[
                        { title: '期次', dataIndex: 'period_index', width: 70 },
                        {
                          title: '账期',
                          key: 'period',
                          width: 220,
                          render: (_v, r) => periodText(r.period_start, r.period_end),
                        },
                        {
                          title: '当期租金',
                          dataIndex: 'rent_amount',
                          align: 'right',
                          render: (v: number) => <MoneyText value={v} />,
                        },
                        {
                          title: '装修抵扣',
                          dataIndex: 'decoration_deduction',
                          align: 'right',
                          render: (v: number) => (
                            <span className="tabular-nums text-[13px] font-medium text-[#7C5CFF]">
                              -{money(v)}
                            </span>
                          ),
                        },
                        {
                          title: '实付租金',
                          dataIndex: 'payable_amount',
                          align: 'right',
                          render: (v: number) => <MoneyText value={v} strong />,
                        },
                      ]}
                    />
                  </div>
                ),
            },
            {
              key: 'payments',
              label: `收款记录 (${payments.length})`,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  className="pt-2"
                  dataSource={payments}
                  pagination={{ pageSize: 12, showSizeChanger: false }}
                  columns={[
                    { title: '收款日期', dataIndex: 'pay_date', width: 120 },
                    { title: '账单号', dataIndex: 'bill_no', width: 190 },
                    {
                      title: '收款金额',
                      dataIndex: 'amount',
                      width: 130,
                      align: 'right',
                      render: (v: number) => <MoneyText value={v} tone="success" strong />,
                    },
                    {
                      title: '支付方式',
                      dataIndex: 'method',
                      width: 110,
                      render: (v: string) => PAY_METHOD[v as 'transfer'] ?? v,
                    },
                    { title: '经办人', dataIndex: 'operator', width: 100 },
                    { title: '备注', dataIndex: 'remark', render: (v: string | null) => v ?? '—' },
                  ]}
                />
              ),
            },
            {
              key: 'deposits',
              label: `押金台账 (${deposits.length})`,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  className="pt-2"
                  dataSource={deposits}
                  pagination={false}
                  columns={[
                    { title: '发生日期', dataIndex: 'happen_date', width: 120 },
                    {
                      title: '类型',
                      dataIndex: 'type',
                      width: 100,
                      render: (v: string) => DEPOSIT_TYPE[v as 'collect'] ?? v,
                    },
                    {
                      title: '金额',
                      dataIndex: 'amount',
                      width: 140,
                      align: 'right',
                      render: (v: number, r) => (
                        <MoneyText
                          value={v}
                          tone={r.type === 'collect' ? 'default' : r.type === 'refund' ? 'success' : 'danger'}
                          strong
                        />
                      ),
                    },
                    { title: '经办人', dataIndex: 'operator', width: 100 },
                    { title: '说明', dataIndex: 'remark', render: (v: string | null) => v ?? '—' },
                  ]}
                />
              ),
            },
          ]}
        />
      </PageCard>

      <ContractModal
        open={contractOpen}
        leaseId={leaseId}
        leaseNo={lease.lease_no}
        propertyType={lease.property_type}
        hasDecoration={lease.decoration_total > 0}
        onClose={() => setContractOpen(false)}
      />

      <SettlementModal
        open={settlementOpen}
        leaseId={leaseId}
        leaseNo={lease.lease_no}
        onClose={() => setSettlementOpen(false)}
        onDone={load}
      />
    </div>
  )
}

export type { LeaseStatus }
