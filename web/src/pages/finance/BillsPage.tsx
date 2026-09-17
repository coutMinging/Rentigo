import { useState } from 'react'
import { Button, DatePicker, Input, Select, Table, Tabs, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Download, Plus, Receipt } from 'lucide-react'
import dayjs from 'dayjs'
import { billApi, type BillListResult } from '../../api/bill'
import { MoneyText } from '../../components/DataDisplay'
import { PageCard } from '../../components/Surface'
import { StatusTag } from '../../components/StatusTag'
import { usePermission, useTableQuery } from '../../hooks'
import { BILL_STATUS, DEPOSIT_TYPE, PAY_METHOD, PROPERTY_TYPE } from '../../utils/constants'
import { dateText, money, periodText } from '../../utils/format'
import type { Bill, BillStatus, DepositRecord, Payment } from '../../types'
import { AddFeeModal, BillDetailDrawer, PaymentModal } from './BillModals'

const initialFilters = {
  keyword: '',
  status: '',
  property_type: '',
  range: undefined as [dayjs.Dayjs, dayjs.Dayjs] | undefined,
}

export default function BillsPage() {
  const can = usePermission()
  const [activeTab, setActiveTab] = useState('bills')

  const [draft, setDraft] = useState<Record<string, unknown>>(initialFilters)
  const [filters, setFilters] = useState<Record<string, unknown>>(initialFilters)

  const [payBill, setPayBill] = useState<Bill | null>(null)
  const [feeBill, setFeeBill] = useState<Bill | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  const buildParams = (f: Record<string, unknown>) => {
    const range = f.range as [dayjs.Dayjs, dayjs.Dayjs] | undefined
    return {
      keyword: f.keyword,
      status: f.status,
      property_type: f.property_type,
      start_date: range?.[0]?.format('YYYY-MM-DD'),
      end_date: range?.[1]?.format('YYYY-MM-DD'),
    }
  }

  const billTable = useTableQuery<Bill>({
    fetcher: (p) => billApi.list(buildParams(p)),
    defaultFilters: initialFilters,
  })

  const paymentTable = useTableQuery<Payment>({
    fetcher: (p) => billApi.payments({ keyword: p.keyword, page: p.page, pageSize: p.pageSize }),
    defaultFilters: { keyword: '' },
  })

  const [deposits, setDeposits] = useState<DepositRecord[]>([])
  const [depositSummary, setDepositSummary] = useState({
    collected: 0,
    refunded: 0,
    deducted: 0,
    holding: 0,
  })
  const [depositLoaded, setDepositLoaded] = useState(false)

  const loadDeposits = () => {
    billApi
      .deposits()
      .then((res) => {
        setDeposits(res.list)
        setDepositSummary(res.summary)
        setDepositLoaded(true)
      })
      .catch((err) => console.error('[bill] 押金台账加载失败:', err))
  }

  // 汇总数据随列表接口一起返回，保证与列表同口径
  const totals = (billTable.meta as BillListResult | null)?.totals

  const handleExport = async () => {
    setExporting(true)
    try {
      await billApi.export(buildParams(filters))
    } catch (err) {
      console.error('[bill] 导出失败:', err)
    } finally {
      setExporting(false)
    }
  }

  const billColumns: ColumnsType<Bill> = [
    {
      title: '账单',
      dataIndex: 'bill_no',
      width: 190,
      fixed: 'left',
      render: (v: string, record) => (
        <div className="min-w-0">
          <button
            type="button"
            className="cursor-pointer text-left text-[13px] font-medium text-[#1D1D1F] hover:text-[#0066CC]"
            onClick={() => setDetailId(record.id)}
          >
            {v}
          </button>
          <p className="mt-0.5 text-[11.5px] text-[#AEAEB2]">
            {record.lease_no} · 第 {record.period_index} 期
          </p>
        </div>
      ),
    },
    {
      title: '租客',
      dataIndex: 'tenant_name',
      width: 180,
      render: (v: string, record) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] text-[#1D1D1F]">{v}</p>
          <p className="mt-0.5 text-[11.5px] tabular-nums text-[#AEAEB2]">{record.tenant_phone}</p>
        </div>
      ),
    },
    {
      title: '业态 / 房源',
      key: 'property',
      width: 220,
      ellipsis: true,
      render: (_v, record) => (
        <div className="min-w-0">
          <Tag bordered={false} className="!mr-1.5">
            {PROPERTY_TYPE[record.property_type]}
          </Tag>
          <span className="text-[12.5px] text-[#6E6E73]">{record.property_names}</span>
        </div>
      ),
    },
    {
      title: '账期',
      key: 'period',
      width: 200,
      render: (_v, record) => (
        <span className="text-[12.5px] text-[#6E6E73]">
          {periodText(record.period_start, record.period_end)}
        </span>
      ),
    },
    {
      title: '应交日期',
      dataIndex: 'due_date',
      width: 130,
      sorter: (a, b) => a.due_date.localeCompare(b.due_date),
      render: (v: string, record) => (
        <div>
          <span className="text-[13px] text-[#1D1D1F]">{dateText(v)}</span>
          {record.is_overdue && (
            <p className="mt-0.5 text-[11.5px] text-[#D70015]">
              逾期 {record.overdue_days ?? 0} 天
            </p>
          )}
        </div>
      ),
    },
    {
      title: '租金',
      dataIndex: 'rent_amount',
      width: 110,
      align: 'right',
      render: (v: number) => <MoneyText value={v} className="text-[13px]" />,
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
          <span className="text-[13px] text-[#D2D2D7]">—</span>
        ),
    },
    {
      title: '其他费用',
      dataIndex: 'other_amount',
      width: 110,
      align: 'right',
      render: (v: number) =>
        v !== 0 ? (
          <MoneyText value={v} className="text-[13px]" />
        ) : (
          <span className="text-[13px] text-[#D2D2D7]">—</span>
        ),
    },
    {
      title: '应收',
      dataIndex: 'payable_amount',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.payable_amount - b.payable_amount,
      render: (v: number) => <MoneyText value={v} strong className="text-[13.5px]" />,
    },
    {
      title: '欠费',
      dataIndex: 'outstanding',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.outstanding - b.outstanding,
      render: (v: number) =>
        v > 0 ? (
          <MoneyText value={v} tone="danger" strong className="text-[13.5px]" />
        ) : (
          <span className="text-[13px] text-[#AEAEB2]">已结清</span>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      align: 'center',
      render: (v: BillStatus) => <StatusTag meta={BILL_STATUS[v]} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      align: 'center',
      render: (_v, record) => (
        <div className="flex items-center justify-center gap-1">
          {can('bill', 'create') && record.outstanding > 0 && (
            <Tooltip title="登记收款">
              <Button
                type="text"
                size="small"
                icon={<Receipt size={15} />}
                onClick={() => setPayBill(record)}
              />
            </Tooltip>
          )}
          {can('bill', 'edit') && (
            <Tooltip title="追加费用">
              <Button
                type="text"
                size="small"
                icon={<Plus size={15} />}
                onClick={() => setFeeBill(record)}
              />
            </Tooltip>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* 汇总 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: '筛选范围应收', value: totals?.payable ?? 0, tone: 'default' as const },
          { label: '筛选范围实收', value: totals?.paid ?? 0, tone: 'success' as const },
          { label: '欠费合计', value: totals?.outstanding ?? 0, tone: 'danger' as const },
          { label: '装修抵扣合计', value: totals?.deduction ?? 0, tone: 'default' as const },
        ].map((item) => (
          <PageCard key={item.label} hoverable>
            <p className="text-[12.5px] text-[#86868B]">{item.label}</p>
            <MoneyText value={item.value} tone={item.tone} strong className="mt-2 block text-[22px]" />
          </PageCard>
        ))}
      </div>

      <PageCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[240px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">关键词</p>
            <Input
              allowClear
              placeholder="账单号 / 租约号 / 租客"
              value={draft.keyword as string}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              onPressEnter={() => {
                setFilters(draft)
                billTable.search(draft)
              }}
            />
          </div>
          <div className="w-[140px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">账单状态</p>
            <Select
              allowClear
              placeholder="全部"
              className="w-full"
              value={(draft.status as string) || undefined}
              onChange={(v) => setDraft({ ...draft, status: v ?? '' })}
              options={[
                ...Object.entries(BILL_STATUS).map(([value, meta]) => ({ value, label: meta.label })),
                { value: 'unpaid', label: '全部未结清' },
              ]}
            />
          </div>
          <div className="w-[130px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">业态</p>
            <Select
              allowClear
              placeholder="全部"
              className="w-full"
              value={(draft.property_type as string) || undefined}
              onChange={(v) => setDraft({ ...draft, property_type: v ?? '' })}
              options={[
                { value: 'factory', label: '厂房' },
                { value: 'apartment', label: '公寓' },
              ]}
            />
          </div>
          <div className="w-[240px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">账期区间</p>
            <DatePicker.RangePicker
              className="w-full"
              format="YYYY-MM-DD"
              value={draft.range as [dayjs.Dayjs, dayjs.Dayjs] | undefined}
              onChange={(v) =>
                setDraft({ ...draft, range: (v as [dayjs.Dayjs, dayjs.Dayjs]) ?? undefined })
              }
            />
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              onClick={() => {
                setDraft(initialFilters)
                setFilters(initialFilters)
                billTable.search(initialFilters)
              }}
            >
              重置
            </Button>
            <Button
              type="primary"
              onClick={() => {
                setFilters(draft)
                billTable.search(draft)
              }}
            >
              查询
            </Button>
          </div>
        </div>
      </PageCard>

      <PageCard flush>
        <div className="flex items-center justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-[17px] font-semibold leading-6 text-[#1D1D1F]">财务账单台账</h2>
            <p className="mt-1 text-[13px] text-[#86868B]">
              逾期账单整行浅红高亮，点击账单号可查看费用明细与收款流水
            </p>
          </div>
          {can('bill', 'export') && (
            <Button icon={<Download size={15} />} onClick={handleExport} loading={exporting}>
              导出 Excel
            </Button>
          )}
        </div>

        <div className="px-6 pt-3">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key)
              if (key === 'deposits' && !depositLoaded) loadDeposits()
              if (key === 'payments') paymentTable.refresh()
            }}
            items={[
              { key: 'bills', label: `账单台账 (${billTable.total})` },
              { key: 'payments', label: '收款记录' },
              { key: 'deposits', label: '押金台账' },
            ]}
          />
        </div>

        {activeTab === 'bills' && (
          <Table
            rowKey="id"
            columns={billColumns}
            dataSource={billTable.list}
            loading={billTable.loading}
            scroll={{ x: 1800 }}
            rowClassName={(record) => (record.is_overdue ? 'bg-[rgba(215,0,21,0.028)]' : '')}
            pagination={{
              current: billTable.page,
              pageSize: billTable.pageSize,
              total: billTable.total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: billTable.changePage,
            }}
          />
        )}

        {activeTab === 'payments' && (
          <>
            <div className="flex items-center justify-between px-6 pb-3">
              <span className="text-[13px] text-[#86868B]">
                共 <span className="font-medium text-[#1D9A4E]">{paymentTable.total}</span> 笔收款记录
              </span>
              <Input
                allowClear
                placeholder="搜索租客 / 账单号 / 备注"
                className="!w-[260px]"
                onPressEnter={(e) => paymentTable.search({ keyword: e.currentTarget.value })}
              />
            </div>
            <Table
              rowKey="id"
              columns={[
                { title: '收款日期', dataIndex: 'pay_date', width: 130 },
                { title: '账单号', dataIndex: 'bill_no', width: 190 },
                { title: '租约号', dataIndex: 'lease_no', width: 160 },
                { title: '租客', dataIndex: 'tenant_name', width: 200 },
                {
                  title: '业态',
                  dataIndex: 'property_type',
                  width: 90,
                  render: (v: string) => PROPERTY_TYPE[v as 'factory'] ?? '—',
                },
                {
                  title: '收款金额',
                  dataIndex: 'amount',
                  width: 140,
                  align: 'right',
                  render: (v: number) => <MoneyText value={v} tone="success" strong />,
                },
                {
                  title: '支付方式',
                  dataIndex: 'method',
                  width: 120,
                  render: (v: string) => PAY_METHOD[v as 'transfer'] ?? v,
                },
                { title: '经办人', dataIndex: 'operator', width: 100 },
                { title: '备注', dataIndex: 'remark', render: (v: string | null) => v ?? '—' },
              ]}
              dataSource={paymentTable.list}
              loading={paymentTable.loading}
              scroll={{ x: 1400 }}
              pagination={{
                current: paymentTable.page,
                pageSize: paymentTable.pageSize,
                total: paymentTable.total,
                showSizeChanger: true,
                showTotal: (t) => `共 ${t} 笔`,
                onChange: paymentTable.changePage,
              }}
            />
          </>
        )}

        {activeTab === 'deposits' && (
          <>
            <div className="grid grid-cols-4 gap-4 px-6 pb-4">
              {[
                { label: '累计收取', value: depositSummary.collected, tone: 'default' as const },
                { label: '累计退还', value: depositSummary.refunded, tone: 'success' as const },
                { label: '累计抵扣', value: depositSummary.deducted, tone: 'danger' as const },
                { label: '在管押金池', value: depositSummary.holding, tone: 'default' as const },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-black/[0.025] px-4 py-3.5">
                  <p className="text-[12px] text-[#86868B]">{item.label}</p>
                  <MoneyText value={item.value} tone={item.tone} strong className="mt-1.5 block text-[17px]" />
                </div>
              ))}
            </div>
            <Table
              rowKey="id"
              columns={[
                { title: '发生日期', dataIndex: 'happen_date', width: 130 },
                { title: '租约号', dataIndex: 'lease_no', width: 160 },
                { title: '租客', dataIndex: 'tenant_name', width: 200 },
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
                      tone={r.type === 'refund' ? 'success' : r.type === 'deduct' ? 'danger' : 'default'}
                      strong
                    />
                  ),
                },
                { title: '经办人', dataIndex: 'operator', width: 100 },
                { title: '说明', dataIndex: 'remark', render: (v: string | null) => v ?? '—' },
              ]}
              dataSource={deposits}
              pagination={{ pageSize: 15, showSizeChanger: false }}
              scroll={{ x: 1300 }}
            />
          </>
        )}
      </PageCard>

      <PaymentModal
        open={Boolean(payBill)}
        bill={payBill}
        onClose={() => setPayBill(null)}
        onDone={billTable.refresh}
      />
      <AddFeeModal
        open={Boolean(feeBill)}
        bill={feeBill}
        onClose={() => setFeeBill(null)}
        onDone={billTable.refresh}
      />
      <BillDetailDrawer
        open={detailId !== null}
        billId={detailId}
        canEdit={can('bill', 'edit')}
        onClose={() => setDetailId(null)}
        onChanged={billTable.refresh}
      />
    </div>
  )
}
