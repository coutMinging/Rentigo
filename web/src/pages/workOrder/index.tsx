import { useCallback, useEffect, useState } from 'react'
import { Button, DatePicker, Input, Popconfirm, Select, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { Download, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { feedback } from '../../api/feedback'
import { workOrderApi, type WorkOrderPage } from '../../api/workOrder'
import { MoneyText } from '../../components/DataDisplay'
import { EmptyHint, PageCard } from '../../components/Surface'
import { StatusTag } from '../../components/StatusTag'
import { usePermission, useTableQuery } from '../../hooks'
import { PROPERTY_TYPE, WORK_ORDER_STATUS } from '../../utils/constants'
import { dateTimeText } from '../../utils/format'
import type { WorkOrder, WorkOrderPropertyStat, WorkOrderStatus } from '../../types'
import WorkOrderDetailDrawer from './WorkOrderDetailDrawer'
import WorkOrderFormDrawer from './WorkOrderFormDrawer'
import WorkOrderStatsPanel from './WorkOrderStatsPanel'
import WorkOrderStatusModal from './WorkOrderStatusModal'

type PropertyTypeFilter = '' | 'factory' | 'apartment'

const initialFilters = {
  keyword: '',
  status: '',
  property_type: '',
  assignee: '',
  range: undefined as [dayjs.Dayjs, dayjs.Dayjs] | undefined,
}

/** 超过该天数仍未完工的工单整行浅色提示 */
const STALE_DAYS = 3

export default function WorkOrdersPage() {
  const can = usePermission()

  const [draft, setDraft] = useState<Record<string, unknown>>(initialFilters)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<WorkOrder | null>(null)
  const [statusRecord, setStatusRecord] = useState<WorkOrder | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  const [statsType, setStatsType] = useState<PropertyTypeFilter>('')
  const [propertyStats, setPropertyStats] = useState<WorkOrderPropertyStat[]>([])
  const [statsLoading, setStatsLoading] = useState(false)

  const buildParams = (f: Record<string, unknown>) => {
    const range = f.range as [dayjs.Dayjs, dayjs.Dayjs] | undefined
    return {
      keyword: f.keyword,
      status: f.status,
      property_type: f.property_type,
      assignee: f.assignee,
      start_date: range?.[0]?.format('YYYY-MM-DD'),
      end_date: range?.[1]?.format('YYYY-MM-DD'),
    }
  }

  const table = useTableQuery<WorkOrder>({
    fetcher: (params) => workOrderApi.list(buildParams(params)),
    defaultFilters: initialFilters,
  })

  const stats = (table.meta as WorkOrderPage | null)?.stats

  const loadPropertyStats = useCallback(() => {
    setStatsLoading(true)
    workOrderApi
      .stats(statsType ? { property_type: statsType } : undefined)
      .then((res) => setPropertyStats(res.list ?? []))
      .catch((err) => console.error('[workOrder] 房源维修统计加载失败:', err))
      .finally(() => setStatsLoading(false))
  }, [statsType])

  useEffect(() => {
    loadPropertyStats()
  }, [loadPropertyStats])

  const refreshAll = () => {
    table.refresh()
    loadPropertyStats()
  }

  const applyStatusFilter = (status: WorkOrderStatus | '') => {
    const next = { ...draft, status }
    setDraft(next)
    table.search(next)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await workOrderApi.export(buildParams(table.filters))
    } catch (err) {
      console.error('[workOrder] 导出失败:', err)
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async (record: WorkOrder) => {
    try {
      await workOrderApi.remove(record.id)
      feedback.success(`工单 ${record.order_no} 已删除`)
      refreshAll()
    } catch (err) {
      console.error('[workOrder] 删除失败:', err)
    }
  }

  const isStale = (record: WorkOrder) => {
    if (record.status === 'done' || record.status === 'closed') return false
    return dayjs().diff(dayjs(record.created_at), 'day') > STALE_DAYS
  }

  const columns: ColumnsType<WorkOrder> = [
    {
      title: '工单号',
      dataIndex: 'order_no',
      width: 170,
      fixed: 'left',
      render: (value: string, record) => (
        <div className="min-w-0">
          <button
            type="button"
            className="cursor-pointer text-left text-[13px] font-medium text-[#1D1D1F] hover:text-[#0066CC]"
            onClick={() => setDetailId(record.id)}
          >
            {value}
          </button>
          <p className="mt-0.5 text-[11.5px] text-[#AEAEB2]">{dateTimeText(record.created_at)}</p>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      align: 'center',
      render: (value: WorkOrderStatus) => <StatusTag meta={WORK_ORDER_STATUS[value]} />,
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
          <span className="text-[12.5px] text-[#6E6E73]">{record.property_name ?? '未关联房源'}</span>
        </div>
      ),
    },
    {
      title: '报修人',
      key: 'reporter',
      width: 170,
      render: (_v, record) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] text-[#1D1D1F]">{record.reporter}</p>
          <p className="mt-0.5 text-[11.5px] tabular-nums text-[#AEAEB2]">{record.phone ?? '—'}</p>
        </div>
      ),
    },
    {
      title: '故障描述',
      dataIndex: 'fault_desc',
      ellipsis: true,
      render: (value: string) => <span className="text-[12.5px] text-[#6E6E73]">{value}</span>,
    },
    {
      title: '维修人员',
      dataIndex: 'assignee',
      width: 140,
      render: (value: string | null) =>
        value ? (
          <span className="text-[13px] text-[#1D1D1F]">{value}</span>
        ) : (
          <span className="text-[12.5px] text-[#C77700]">待指派</span>
        ),
    },
    {
      title: '维修费用',
      dataIndex: 'cost',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.cost - b.cost,
      render: (value: number) =>
        value > 0 ? (
          <MoneyText value={value} strong className="text-[13px]" />
        ) : (
          <span className="text-[13px] text-[#D2D2D7]">—</span>
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right',
      align: 'center',
      render: (_v, record) => (
        <div className="flex items-center justify-center gap-1">
          {can('workOrder', 'edit') && (
            <Tooltip title="流转 / 更新进度">
              <Button
                type="text"
                size="small"
                icon={<Wrench size={15} />}
                disabled={record.status === 'closed'}
                onClick={() => setStatusRecord(record)}
              />
            </Tooltip>
          )}
          {can('workOrder', 'edit') && (
            <Tooltip title="编辑信息">
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
          {can('workOrder', 'delete') && (
            <Popconfirm
              title="删除该工单？"
              description="删除后不可恢复"
              okText="删除"
              cancelText="取消"
              onConfirm={() => handleDelete(record)}
            >
              <Tooltip title="删除">
                <Button type="text" size="small" danger icon={<Trash2 size={15} />} />
              </Tooltip>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <WorkOrderStatsPanel
        stats={stats}
        propertyStats={propertyStats}
        loading={statsLoading}
        propertyType={statsType}
        onPropertyTypeChange={setStatsType}
        activeStatus={(draft.status as WorkOrderStatus) || ''}
        onStatusClick={applyStatusFilter}
      />

      <PageCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[240px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">关键词</p>
            <Input
              allowClear
              placeholder="工单号 / 报修人 / 电话 / 房源"
              value={draft.keyword as string}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              onPressEnter={() => table.search(draft)}
            />
          </div>
          <div className="w-[140px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">工单状态</p>
            <Select
              allowClear
              placeholder="全部"
              className="w-full"
              value={(draft.status as string) || undefined}
              onChange={(v) => setDraft({ ...draft, status: v ?? '' })}
              options={Object.entries(WORK_ORDER_STATUS).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
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
          <div className="w-[180px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">维修人员</p>
            <Input
              allowClear
              placeholder="按维修人筛选"
              value={draft.assignee as string}
              onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
              onPressEnter={() => table.search(draft)}
            />
          </div>
          <div className="w-[240px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">报修时间</p>
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
                table.search(initialFilters)
              }}
            >
              重置
            </Button>
            <Button type="primary" onClick={() => table.search(draft)}>
              查询
            </Button>
          </div>
        </div>
      </PageCard>

      <PageCard flush>
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-[17px] font-semibold leading-6 text-[#1D1D1F]">报修工单台账</h2>
            <p className="mt-1 text-[13px] text-[#86868B]">
              超过 {STALE_DAYS} 天仍未完工的工单整行浅色提示，点击工单号可查看故障图片与维修进度
            </p>
          </div>
          <div className="flex gap-2">
            {can('workOrder', 'export') && (
              <Button icon={<Download size={15} />} onClick={handleExport} loading={exporting}>
                导出 Excel
              </Button>
            )}
            {can('workOrder', 'create') && (
              <Button
                type="primary"
                icon={<Plus size={15} />}
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                新建工单
              </Button>
            )}
          </div>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={table.list}
          loading={table.loading}
          scroll={{ x: 1560 }}
          rowClassName={(record) => (isStale(record) ? 'bg-[rgba(199,119,0,0.035)]' : '')}
          locale={{
            emptyText: (
              <EmptyHint
                title="暂无报修工单"
                description="当前筛选条件下没有工单，可调整条件或登记新的报修需求"
              />
            ),
          }}
          pagination={{
            current: table.page,
            pageSize: table.pageSize,
            total: table.total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: table.changePage,
          }}
        />
      </PageCard>

      <WorkOrderFormDrawer
        open={formOpen}
        record={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onDone={refreshAll}
      />
      <WorkOrderStatusModal
        open={Boolean(statusRecord)}
        record={statusRecord}
        onClose={() => setStatusRecord(null)}
        onDone={refreshAll}
      />
      <WorkOrderDetailDrawer
        open={detailId !== null}
        id={detailId}
        canEdit={can('workOrder', 'edit')}
        onClose={() => setDetailId(null)}
        onEdit={(record) => {
          setDetailId(null)
          setEditing(record)
          setFormOpen(true)
        }}
        onStatus={(record) => {
          setDetailId(null)
          setStatusRecord(record)
        }}
      />
    </div>
  )
}
