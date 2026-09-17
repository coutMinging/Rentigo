import { useCallback, useState } from 'react'
import { Button, DatePicker, Input, Select, Space, Table, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { feedback } from '../../api/feedback'
import { viewingApi } from '../../api/viewing'
import { PageCard } from '../../components/Surface'
import { PlainTag, StatusTag } from '../../components/StatusTag'
import { usePermission, useTableQuery } from '../../hooks'
import { PROPERTY_TYPE, TONE_COLOR, VIEWING_STATUS, VIEWING_TRANSITIONS } from '../../utils/constants'
import { cn } from '../../utils/cn'
import { dateTimeText } from '../../utils/format'
import type { Viewing, ViewingDetail, ViewingStats, ViewingStatus } from '../../types'
import ViewingDetailDrawer from './ViewingDetailDrawer'
import ViewingFormDrawer from './ViewingFormDrawer'

const initialFilters = { keyword: '', status: '', property_type: '', start_date: '', end_date: '' }

const EMPTY_STATS: ViewingStats = {
  pending: 0,
  appointed: 0,
  viewed: 0,
  no_intent: 0,
  signed: 0,
  total: 0,
}

const STATUS_ORDER: ViewingStatus[] = ['pending', 'appointed', 'viewed', 'no_intent', 'signed']

export default function ViewingPage() {
  const navigate = useNavigate()
  const can = usePermission()

  const [filters, setFilters] = useState<Record<string, unknown>>(initialFilters)
  const [draft, setDraft] = useState<Record<string, unknown>>(initialFilters)
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [stats, setStats] = useState<ViewingStats>(EMPTY_STATS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Viewing | null>(null)
  const [detail, setDetail] = useState<ViewingDetail | null>(null)
  const [exporting, setExporting] = useState(false)

  const { list, total, loading, page, pageSize, search, refresh, changePage } =
    useTableQuery<Viewing>({
      fetcher: async (params) => {
        const result = await viewingApi.list(params)
        setStats(result.stats ?? EMPTY_STATS)
        return result
      },
      defaultFilters: initialFilters,
    })

  const openDetail = useCallback((id: number) => {
    viewingApi
      .detail(id)
      .then(setDetail)
      .catch((err) => console.error('[viewing] 详情加载失败:', err))
  }, [])

  const reloadDetail = useCallback((id: number) => {
    viewingApi
      .detail(id)
      .then(setDetail)
      .catch((err) => console.error('[viewing] 详情刷新失败:', err))
  }, [])

  const handleSearch = () => {
    const next = {
      ...draft,
      start_date: range?.[0] ? range[0].format('YYYY-MM-DD') : '',
      end_date: range?.[1] ? range[1].format('YYYY-MM-DD') : '',
    }
    setFilters(next)
    search(next)
  }

  const handleReset = () => {
    setDraft(initialFilters)
    setRange(null)
    setFilters(initialFilters)
    search(initialFilters)
  }

  const applyStatus = (status: string) => {
    const next = { ...filters, status }
    setDraft((prev) => ({ ...prev, status }))
    setFilters(next)
    search(next)
  }

  /** 转为签约：跳转租约页并携带预填参数，由租约页自动打开新建抽屉 */
  const convertToLease = (record: Viewing) => {
    const params = new URLSearchParams({ from_viewing: String(record.id) })
    if (record.tenant_id) params.set('tenant_id', String(record.tenant_id))
    params.set('property_type', record.property_type)
    if (record.property_id) params.set('property_id', String(record.property_id))
    navigate(`/leases?${params.toString()}`)
  }

  const handleDelete = async (record: Viewing) => {
    const confirmed = await feedback.confirm(
      '确认删除看房预约',
      `将删除「${record.tenant_name}」的看房记录及其全部跟进记录，删除后不可恢复。`,
    )
    if (!confirmed) return

    try {
      await viewingApi.remove(record.id)
      feedback.success('看房预约已删除')
      refresh()
    } catch (err) {
      console.error('[viewing] 删除失败:', err)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await viewingApi.export(filters)
    } catch (err) {
      console.error('[viewing] 导出失败:', err)
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<Viewing> = [
    {
      title: '租客',
      dataIndex: 'tenant_name',
      width: 230,
      fixed: 'left',
      render: (_v, record) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cursor-pointer truncate text-left text-[13.5px] font-medium text-[#1D1D1F] hover:text-[#0066CC]"
              onClick={() => openDetail(record.id)}
            >
              {record.tenant_name}
            </button>
            {record.tenant_id && <PlainTag>已建档</PlainTag>}
          </div>
          <p className="mt-0.5 tabular-nums text-[12px] text-[#AEAEB2]">{record.phone}</p>
        </div>
      ),
    },
    {
      title: '意向房源',
      dataIndex: 'property_name',
      width: 250,
      render: (_v, record) => (
        <div className="flex items-center gap-2">
          <PlainTag>{PROPERTY_TYPE[record.property_type]}</PlainTag>
          <span className="truncate text-[13px] text-[#6E6E73]">{record.property_name ?? '未指定'}</span>
        </div>
      ),
    },
    {
      title: '预约时间',
      dataIndex: 'appoint_time',
      width: 160,
      sorter: (a, b) => String(a.appoint_time ?? '').localeCompare(String(b.appoint_time ?? '')),
      render: (v: string | null) => (
        <span className="tabular-nums text-[13px] text-[#6E6E73]">{v ? dateTimeText(v) : '待定'}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v: ViewingStatus) => <StatusTag meta={VIEWING_STATUS[v]} />,
    },
    {
      title: '跟进',
      dataIndex: 'follow_up_count',
      width: 90,
      align: 'right',
      render: (v: number) =>
        v > 0 ? (
          <span className="tabular-nums text-[13px] text-[#1D1D1F]">{v} 次</span>
        ) : (
          <span className="text-[13px] text-[#AEAEB2]">—</span>
        ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 220,
      ellipsis: true,
      render: (v: string | null) => <span className="text-[13px] text-[#6E6E73]">{v ?? '—'}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 210,
      fixed: 'right',
      align: 'center',
      render: (_v, record) => (
        <div className="flex items-center justify-center gap-1">
          <Button type="text" size="small" onClick={() => openDetail(record.id)}>
            详情
          </Button>
          {can('viewing', 'edit') && VIEWING_TRANSITIONS[record.status].includes('signed') && (
            <Button type="text" size="small" onClick={() => convertToLease(record)}>
              转为签约
            </Button>
          )}
          {can('viewing', 'edit') && (
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<Pencil size={15} />}
                onClick={() => {
                  setEditing(record)
                  setFormOpen(true)
                }}
              />
            </Tooltip>
          )}
          {can('viewing', 'delete') && (
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<Trash2 size={15} />}
                onClick={() => handleDelete(record)}
              />
            </Tooltip>
          )}
        </div>
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
              placeholder="姓名 / 电话 / 意向房源"
              value={draft.keyword as string}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              onPressEnter={handleSearch}
            />
          </div>
          <div className="w-[140px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">房源业态</p>
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
          <div className="w-[150px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">跟进状态</p>
            <Select
              allowClear
              placeholder="全部"
              className="w-full"
              value={(draft.status as string) || undefined}
              onChange={(v) => setDraft({ ...draft, status: v ?? '' })}
              options={STATUS_ORDER.map((status) => ({
                value: status,
                label: VIEWING_STATUS[status].label,
              }))}
            />
          </div>
          <div className="w-[260px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">预约时间段</p>
            <DatePicker.RangePicker
              className="w-full"
              value={range}
              onChange={(v) => setRange(v)}
            />
          </div>
          <div className="ml-auto flex gap-2">
            <Button onClick={handleReset}>重置</Button>
            <Button type="primary" onClick={handleSearch}>
              查询
            </Button>
          </div>
        </div>
      </PageCard>

      <PageCard>
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
          <button
            type="button"
            onClick={() => applyStatus('')}
            className={cn(
              'cursor-pointer rounded-2xl border px-4 py-3.5 text-left transition-colors duration-200',
              !filters.status
                ? 'border-[#1D1D1F] bg-black/[0.02]'
                : 'border-black/[0.06] hover:bg-black/[0.02]',
            )}
          >
            <p className="text-[12px] text-[#86868B]">全部</p>
            <p className="mt-1.5 text-[22px] font-semibold leading-7 tabular-nums text-[#1D1D1F]">
              {stats.total}
            </p>
          </button>
          {STATUS_ORDER.map((status) => {
            const meta = VIEWING_STATUS[status]
            const active = filters.status === status
            return (
              <button
                key={status}
                type="button"
                onClick={() => applyStatus(status)}
                className={cn(
                  'cursor-pointer rounded-2xl border px-4 py-3.5 text-left transition-colors duration-200',
                  active
                    ? 'border-[#1D1D1F] bg-black/[0.02]'
                    : 'border-black/[0.06] hover:bg-black/[0.02]',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: TONE_COLOR[meta.tone] }}
                  />
                  <span className="text-[12px] text-[#86868B]">{meta.label}</span>
                </span>
                <span className="mt-1.5 block text-[22px] font-semibold leading-7 tabular-nums text-[#1D1D1F]">
                  {stats[status]}
                </span>
              </button>
            )
          })}
        </div>
      </PageCard>

      <PageCard flush>
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          <div>
            <h2 className="text-[17px] font-semibold leading-6 text-[#1D1D1F]">看房预约台账</h2>
            <p className="mt-1 text-[13px] text-[#86868B]">
              共 {total} 条 · 从登记、跟进到转为签约全程留痕
            </p>
          </div>
          <Space>
            {can('viewing', 'export') && (
              <Button icon={<Download size={15} />} onClick={handleExport} loading={exporting}>
                导出 Excel
              </Button>
            )}
            {can('viewing', 'create') && (
              <Button
                type="primary"
                icon={<Plus size={15} />}
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                登记看房预约
              </Button>
            )}
          </Space>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          scroll={{ x: 1270 }}
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

      <ViewingFormDrawer
        open={formOpen}
        record={editing}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />

      <ViewingDetailDrawer
        open={Boolean(detail)}
        detail={detail}
        onClose={() => setDetail(null)}
        onChanged={(id) => {
          reloadDetail(id)
          refresh()
        }}
        onConvert={convertToLease}
      />
    </div>
  )
}
