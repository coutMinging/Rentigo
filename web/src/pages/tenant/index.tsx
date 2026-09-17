import { useCallback, useState } from 'react'
import { Button, Descriptions, Drawer, Input, Select, Space, Table, Tabs, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { tenantApi } from '../../api/property'
import { feedback } from '../../api/feedback'
import { MoneyText } from '../../components/DataDisplay'
import { PageCard, SectionTitle } from '../../components/Surface'
import { PlainTag, StatusTag } from '../../components/StatusTag'
import { usePermission, useTableQuery } from '../../hooks'
import { LEASE_STATUS, PROPERTY_TYPE, TENANT_TAG } from '../../utils/constants'
import { dateText, maskPhone, money } from '../../utils/format'
import type { Tenant, TenantDetail, TenantTag } from '../../types'
import TenantFormDrawer from './TenantFormDrawer'

const initialFilters = { keyword: '', type: '', tag: '' }

export default function TenantsPage() {
  const can = usePermission()
  const [filters, setFilters] = useState<Record<string, unknown>>(initialFilters)
  const [draft, setDraft] = useState<Record<string, unknown>>(initialFilters)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [detail, setDetail] = useState<TenantDetail | null>(null)
  const [exporting, setExporting] = useState(false)

  const { list, total, loading, page, pageSize, search, refresh, changePage } =
    useTableQuery<Tenant>({
      fetcher: (params) => tenantApi.list(params),
      defaultFilters: initialFilters,
    })

  const openDetail = useCallback((id: number) => {
    tenantApi
      .detail(id)
      .then(setDetail)
      .catch((err) => console.error('[tenant] 详情加载失败:', err))
  }, [])

  const handleDelete = async (record: Tenant) => {
    const confirmed = await feedback.confirm(
      '确认删除租客',
      `将删除「${record.name}」的档案。若存在租约记录，为保证台账可追溯，系统会拒绝删除。`,
    )
    if (!confirmed) return

    try {
      await tenantApi.remove(record.id)
      feedback.success('租客档案已删除')
      refresh()
    } catch (err) {
      console.error('[tenant] 删除失败:', err)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await tenantApi.export(filters)
    } catch (err) {
      console.error('[tenant] 导出失败:', err)
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<Tenant> = [
    {
      title: '租客',
      dataIndex: 'name',
      width: 260,
      fixed: 'left',
      render: (_v, record) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cursor-pointer truncate text-left text-[13.5px] font-medium text-[#1D1D1F] hover:text-[#0066CC]"
              onClick={() => openDetail(record.id)}
            >
              {record.name}
            </button>
            <PlainTag>{record.type === 'company' ? '企业' : '个人'}</PlainTag>
          </div>
          {record.contact_name && (
            <p className="mt-0.5 text-[12px] text-[#AEAEB2]">联系人 {record.contact_name}</p>
          )}
        </div>
      ),
    },
    {
      title: '联系电话',
      dataIndex: 'phone',
      width: 140,
      render: (v: string) => <span className="tabular-nums text-[13px] text-[#6E6E73]">{v}</span>,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 240,
      render: (v: TenantTag[]) => (
        <Space size={6} wrap>
          {v.length === 0 && <span className="text-[13px] text-[#AEAEB2]">—</span>}
          {v.map((tag) => (
            <StatusTag key={tag} meta={TENANT_TAG[tag]} />
          ))}
        </Space>
      ),
    },
    {
      title: '在租租约',
      dataIndex: 'active_lease_count',
      width: 100,
      align: 'right',
      sorter: (a, b) => (a.active_lease_count ?? 0) - (b.active_lease_count ?? 0),
      render: (v: number, record) => (
        <div className="tabular-nums">
          <span className="text-[13.5px] text-[#1D1D1F]">{v ?? 0} 份</span>
          {record.monthly_rent ? (
            <p className="text-[11.5px] text-[#AEAEB2]">{money(record.monthly_rent)} 元/月</p>
          ) : null}
        </div>
      ),
    },
    {
      title: '欠费金额',
      dataIndex: 'owed_amount',
      width: 130,
      align: 'right',
      sorter: (a, b) => (a.owed_amount ?? 0) - (b.owed_amount ?? 0),
      render: (v: number) =>
        v > 0 ? (
          <MoneyText value={v} tone="danger" strong className="text-[13.5px]" />
        ) : (
          <span className="text-[13px] text-[#AEAEB2]">无欠费</span>
        ),
    },
    {
      title: '联系地址',
      dataIndex: 'address',
      width: 260,
      ellipsis: true,
      render: (v: string | null) => <span className="text-[13px] text-[#6E6E73]">{v ?? '—'}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right',
      align: 'center',
      render: (_v, record) => (
        <div className="flex items-center justify-center gap-1">
          <Button type="text" size="small" onClick={() => openDetail(record.id)}>
            详情
          </Button>
          {can('tenant', 'edit') && (
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
          {can('tenant', 'delete') && (
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
              placeholder="姓名 / 公司 / 电话 / 证件号"
              value={draft.keyword as string}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              onPressEnter={() => {
                setFilters(draft)
                search(draft)
              }}
            />
          </div>
          <div className="w-[140px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">租客类型</p>
            <Select
              allowClear
              placeholder="全部"
              className="w-full"
              value={(draft.type as string) || undefined}
              onChange={(v) => setDraft({ ...draft, type: v ?? '' })}
              options={[
                { value: 'person', label: '个人租客' },
                { value: 'company', label: '企业租客' },
              ]}
            />
          </div>
          <div className="w-[150px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">租客标签</p>
            <Select
              allowClear
              placeholder="全部"
              className="w-full"
              value={(draft.tag as string) || undefined}
              onChange={(v) => setDraft({ ...draft, tag: v ?? '' })}
              options={Object.entries(TENANT_TAG).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
            />
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              onClick={() => {
                setDraft(initialFilters)
                setFilters(initialFilters)
                search(initialFilters)
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
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          <div>
            <h2 className="text-[17px] font-semibold leading-6 text-[#1D1D1F]">租客档案</h2>
            <p className="mt-1 text-[13px] text-[#86868B]">
              共 {total} 位租客 · 标签由租约与账单自动推导，无需人工维护
            </p>
          </div>
          <Space>
            {can('tenant', 'export') && (
              <Button icon={<Download size={15} />} onClick={handleExport} loading={exporting}>
                导出 Excel
              </Button>
            )}
            {can('tenant', 'create') && (
              <Button
                type="primary"
                icon={<Plus size={15} />}
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                新增租客
              </Button>
            )}
          </Space>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          scroll={{ x: 1380 }}
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

      <TenantFormDrawer
        open={formOpen}
        record={editing}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />

      {/* 详情抽屉：关联房源、有效租约与历史记录 */}
      <Drawer
        title={detail ? `${detail.name}` : '租客详情'}
        width={720}
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div className="space-y-6">
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="租客类型">
                {detail.type === 'company' ? '企业租客' : '个人租客'}
              </Descriptions.Item>
              <Descriptions.Item label="联系电话">{detail.phone}</Descriptions.Item>
              {detail.contact_name && (
                <Descriptions.Item label="联系人">{detail.contact_name}</Descriptions.Item>
              )}
              <Descriptions.Item label={detail.type === 'company' ? '信用代码' : '身份证号'}>
                {detail.id_card ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="联系地址" span={2}>
                {detail.address ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="标签" span={2}>
                <Space size={6} wrap>
                  {detail.tags.map((tag) => (
                    <StatusTag key={tag} meta={TENANT_TAG[tag]} />
                  ))}
                  {detail.tags.length === 0 && <span className="text-[#AEAEB2]">—</span>}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="未结清账单">
                {detail.unpaid_bill_count ?? 0} 笔
              </Descriptions.Item>
              <Descriptions.Item label="欠费金额">
                <MoneyText
                  value={detail.owed_amount}
                  tone={(detail.owed_amount ?? 0) > 0 ? 'danger' : 'muted'}
                  strong
                />
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {detail.remark ?? '—'}
              </Descriptions.Item>
            </Descriptions>

            <Tabs
              items={[
                {
                  key: 'active',
                  label: `有效租约 (${detail.active_leases?.length ?? 0})`,
                  children: (
                    <div className="space-y-2.5">
                      {(detail.active_leases ?? []).length === 0 && (
                        <p className="py-6 text-center text-[13px] text-[#AEAEB2]">暂无有效租约</p>
                      )}
                      {(detail.active_leases ?? []).map((lease) => (
                        <Link
                          key={lease.id}
                          to={`/leases/${lease.id}`}
                          className="block rounded-2xl border border-black/[0.06] px-4 py-3.5 transition-colors hover:bg-black/[0.02]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[13.5px] font-medium text-[#1D1D1F]">
                              {lease.lease_no}
                            </span>
                            <StatusTag meta={LEASE_STATUS[lease.status]} />
                          </div>
                          <p className="mt-1.5 text-[12.5px] text-[#86868B]">
                            {PROPERTY_TYPE[lease.property_type]} · {dateText(lease.start_date)} ~{' '}
                            {dateText(lease.end_date)} · 月租 {money(lease.monthly_rent)} 元
                          </p>
                          {lease.decoration_total > 0 && (
                            <p className="mt-1 text-[12px] text-[#7C5CFF]">
                              装修抵扣 {money(lease.decoration_deducted)} / {money(lease.decoration_total)} 元
                            </p>
                          )}
                        </Link>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'properties',
                  label: `关联房源 (${detail.properties?.length ?? 0})`,
                  children: (
                    <Table
                      rowKey={(r) => `${r.property_type}-${r.property_id}`}
                      size="small"
                      pagination={false}
                      dataSource={detail.properties ?? []}
                      columns={[
                        { title: '业态', dataIndex: 'property_type', width: 80, render: (v) => PROPERTY_TYPE[v as 'factory'] },
                        { title: '房源', dataIndex: 'property_name' },
                        { title: '租约号', dataIndex: 'lease_no', width: 150 },
                        {
                          title: '月租金',
                          dataIndex: 'monthly_rent',
                          width: 120,
                          align: 'right',
                          render: (v: number) => <MoneyText value={v} />,
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'history',
                  label: `历史记录 (${detail.history_leases?.length ?? 0})`,
                  children: (
                    <div className="space-y-2.5">
                      {(detail.history_leases ?? []).length === 0 && (
                        <p className="py-6 text-center text-[13px] text-[#AEAEB2]">暂无历史租赁记录</p>
                      )}
                      {(detail.history_leases ?? []).map((lease) => (
                        <Link
                          key={lease.id}
                          to={`/leases/${lease.id}`}
                          className="block rounded-2xl border border-black/[0.06] px-4 py-3.5 transition-colors hover:bg-black/[0.02]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[13.5px] text-[#6E6E73]">{lease.lease_no}</span>
                            <StatusTag meta={LEASE_STATUS[lease.status]} />
                          </div>
                          <p className="mt-1 text-[12.5px] text-[#86868B]">
                            {dateText(lease.start_date)} ~ {dateText(lease.end_date)}
                          </p>
                        </Link>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'bills',
                  label: '近期账单',
                  children: (
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={detail.recent_bills ?? []}
                      columns={[
                        { title: '账单号', dataIndex: 'bill_no', width: 190 },
                        {
                          title: '账期',
                          key: 'period',
                          width: 190,
                          render: (_v, r) => `${dateText(r.period_start)} ~ ${dateText(r.period_end)}`,
                        },
                        {
                          title: '应收',
                          dataIndex: 'payable_amount',
                          width: 110,
                          align: 'right',
                          render: (v: number) => <MoneyText value={v} />,
                        },
                        {
                          title: '实收',
                          dataIndex: 'paid_amount',
                          width: 110,
                          align: 'right',
                          render: (v: number) => <MoneyText value={v} tone="muted" />,
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </Drawer>
    </div>
  )
}
