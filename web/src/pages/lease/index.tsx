import { useState } from 'react'
import { Button, Input, Select, Space, Table, Tabs, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Download, Plus, ScrollText } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { leaseApi } from '../../api/lease'
import { MoneyText } from '../../components/DataDisplay'
import { PageCard } from '../../components/Surface'
import { StatusTag } from '../../components/StatusTag'
import { usePermission, useTableQuery } from '../../hooks'
import { LEASE_STATUS, PAY_CYCLE, PROPERTY_TYPE } from '../../utils/constants'
import { dateText, money } from '../../utils/format'
import type { Lease, LeaseStatus } from '../../types'
import CreateLeaseDrawer from './CreateLeaseDrawer'

const initialFilters = { keyword: '', status: '', property_type: '' }

export default function LeasesPage() {
  const navigate = useNavigate()
  const can = usePermission()
  const [params, setParams] = useSearchParams()

  const statusFromUrl = params.get('status') ?? ''
  const [filters, setFilters] = useState<Record<string, unknown>>({
    ...initialFilters,
    status: statusFromUrl,
  })
  const [draft, setDraft] = useState<Record<string, unknown>>({
    ...initialFilters,
    status: statusFromUrl,
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { list, total, loading, page, pageSize, search, refresh, changePage } = useTableQuery<Lease>({
    fetcher: (p) => leaseApi.list(p),
    defaultFilters: { ...initialFilters, status: statusFromUrl },
  })

  const applyStatus = (status: string) => {
    const next = { ...draft, status }
    setDraft(next)
    setFilters(next)
    search(next)
    if (status) setParams({ status })
    else setParams({})
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await leaseApi.export(filters)
    } catch (err) {
      console.error('[lease] 导出失败:', err)
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<Lease> = [
    {
      title: '租约号',
      dataIndex: 'lease_no',
      width: 160,
      fixed: 'left',
      render: (v: string, record) => (
        <div className="min-w-0">
          <button
            type="button"
            className="cursor-pointer text-left text-[13.5px] font-medium text-[#1D1D1F] hover:text-[#0066CC]"
            onClick={() => navigate(`/leases/${record.id}`)}
          >
            {v}
          </button>
          <p className="mt-0.5 text-[11.5px] text-[#AEAEB2]">
            {PROPERTY_TYPE[record.property_type]} · {record.pay_cycle_label}
          </p>
        </div>
      ),
    },
    {
      title: '租客',
      dataIndex: 'tenant_name',
      width: 200,
      render: (v: string, record) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] text-[#1D1D1F]">{v}</p>
          <p className="mt-0.5 text-[11.5px] tabular-nums text-[#AEAEB2]">{record.tenant_phone}</p>
        </div>
      ),
    },
    {
      title: '关联房源',
      dataIndex: 'property_names',
      width: 260,
      ellipsis: true,
      render: (v: string) => <span className="text-[12.5px] text-[#6E6E73]">{v || '—'}</span>,
    },
    {
      title: '租期',
      key: 'period',
      width: 200,
      sorter: (a, b) => a.end_date.localeCompare(b.end_date),
      render: (_v, record) => (
        <div className="text-[12.5px]">
          <p className="text-[#6E6E73]">
            {dateText(record.start_date)} ~ {dateText(record.end_date)}
          </p>
          {record.status === 'expiring' && (
            <p className="mt-0.5 text-[11.5px] text-[#C77700]">
              即将到期，请提前确认续租或退租
            </p>
          )}
        </div>
      ),
    },
    {
      title: '月租金',
      dataIndex: 'monthly_rent',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.monthly_rent - b.monthly_rent,
      render: (v: number, record) => (
        <div className="tabular-nums">
          <span className="text-[13.5px] font-medium text-[#1D1D1F]">{money(v)}</span>
          <p className="text-[11.5px] text-[#AEAEB2]">
            押金 {money(record.deposit_amount, false).split('.')[0]}
          </p>
        </div>
      ),
    },
    {
      title: '装修抵扣',
      key: 'decoration',
      width: 160,
      align: 'right',
      render: (_v, record) =>
        record.decoration_total > 0 ? (
          <div className="tabular-nums">
            <p className="text-[13px] text-[#7C5CFF]">
              {money(record.decoration_deducted)} / {money(record.decoration_total)}
            </p>
            <p className="text-[11.5px] text-[#AEAEB2]">
              共 {record.decoration_periods} 期 · 每期 {money(record.decoration_per_month)}
            </p>
          </div>
        ) : (
          <span className="text-[13px] text-[#AEAEB2]">无抵扣</span>
        ),
    },
    {
      title: '欠费',
      dataIndex: 'owed_amount',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.owed_amount - b.owed_amount,
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
      render: (v: LeaseStatus) => <StatusTag meta={LEASE_STATUS[v]} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      align: 'center',
      render: (_v, record) => (
        <Tooltip title="查看租约详情">
          <Button
            type="text"
            size="small"
            icon={<ScrollText size={15} />}
            onClick={() => navigate(`/leases/${record.id}`)}
          />
        </Tooltip>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[260px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">关键词</p>
            <Input
              allowClear
              placeholder="租约号 / 租客姓名 / 电话"
              value={draft.keyword as string}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              onPressEnter={() => {
                setFilters(draft)
                search(draft)
              }}
            />
          </div>
          <div className="w-[140px]">
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
          <div className="ml-auto flex gap-2">
            <Button
              onClick={() => {
                const reset = { ...initialFilters }
                setDraft(reset)
                setFilters(reset)
                search(reset)
                setParams({})
              }}
            >
              重置
            </Button>
            <Button
              type="primary"
              onClick={() => {
                setFilters(draft)
                search(draft)
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
            <h2 className="text-[17px] font-semibold leading-6 text-[#1D1D1F]">租约合同</h2>
            <p className="mt-1 text-[13px] text-[#86868B]">
              共 {total} 份租约 · 到期预警行会高亮提示
            </p>
          </div>
          <Space>
            {can('lease', 'export') && (
              <Button icon={<Download size={15} />} onClick={handleExport} loading={exporting}>
                导出 Excel
              </Button>
            )}
            {can('lease', 'create') && (
              <Button type="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
                新建租约
              </Button>
            )}
          </Space>
        </div>

        <div className="px-6 pb-1 pt-3">
          <Tabs
            activeKey={(filters.status as string) || 'all'}
            onChange={(key) => applyStatus(key === 'all' ? '' : key)}
            items={[
              { key: 'all', label: '全部' },
              ...Object.entries(LEASE_STATUS).map(([key, meta]) => ({
                key,
                label: meta.label,
              })),
            ]}
          />
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          scroll={{ x: 1560 }}
          rowClassName={(record) => (record.status === 'expiring' ? 'bg-[rgba(199,119,0,0.028)]' : '')}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: changePage,
          }}
        />
      </PageCard>

      <CreateLeaseDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          refresh()
          navigate(`/leases/${id}`)
        }}
      />
    </div>
  )
}
