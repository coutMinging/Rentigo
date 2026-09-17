import { useState } from 'react'
import { Button, Descriptions, Drawer, Input, InputNumber, Select, Space, Table, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { factoryApi } from '../../api/property'
import { feedback } from '../../api/feedback'
import { MoneyText } from '../../components/DataDisplay'
import { PageCard } from '../../components/Surface'
import { PlainTag, StatusTag } from '../../components/StatusTag'
import { usePermission, useTableQuery } from '../../hooks'
import { FACTORY_STATUS, FIRE_RATINGS } from '../../utils/constants'
import { areaText, money } from '../../utils/format'
import type { Factory } from '../../types'
import FactoryFormDrawer from './FactoryFormDrawer'

const initialFilters = {
  keyword: '',
  status: '',
  fire_rating: '',
  has_crane: '',
  env_approved: '',
  min_area: undefined,
  max_area: undefined,
}

export default function FactoriesPage() {
  const can = usePermission()
  const [filters, setFilters] = useState<Record<string, unknown>>(initialFilters)
  const [draft, setDraft] = useState<Record<string, unknown>>(initialFilters)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Factory | null>(null)
  const [detail, setDetail] = useState<Factory | null>(null)
  const [exporting, setExporting] = useState(false)

  const { list, total, loading, page, pageSize, search, refresh, changePage } =
    useTableQuery<Factory>({
      fetcher: (params) => factoryApi.list(params),
      defaultFilters: initialFilters,
    })

  const handleDelete = async (record: Factory) => {
    const confirmed = await feedback.confirm(
      '确认删除房源',
      `将删除「${record.name}」，删除后不可恢复。若该房源存在生效租约，系统会拒绝删除。`,
    )
    if (!confirmed) return

    try {
      await factoryApi.remove(record.id)
      feedback.success('房源已删除')
      refresh()
    } catch (err) {
      console.error('[factory] 删除失败:', err)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await factoryApi.export(filters)
    } catch (err) {
      console.error('[factory] 导出失败:', err)
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<Factory> = [
    {
      title: '房源',
      dataIndex: 'name',
      width: 220,
      fixed: 'left',
      render: (_v, record) => (
        <div className="min-w-0">
          <button
            type="button"
            className="cursor-pointer truncate text-left text-[13.5px] font-medium text-[#1D1D1F] hover:text-[#0066CC]"
            onClick={() => setDetail(record)}
          >
            {record.name}
          </button>
          <p className="mt-0.5 text-[12px] text-[#AEAEB2]">{record.code}</p>
        </div>
      ),
    },
    {
      title: '地址',
      dataIndex: 'address',
      width: 260,
      ellipsis: true,
      render: (v: string) => <span className="text-[13px] text-[#6E6E73]">{v}</span>,
    },
    {
      title: '建筑面积',
      dataIndex: 'total_area',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.total_area - b.total_area,
      render: (v: number, record) => (
        <div className="tabular-nums">
          <span className="text-[13px] text-[#1D1D1F]">{areaText(v)} ㎡</span>
          {record.divisible_area > 0 && (
            <p className="text-[11.5px] text-[#AEAEB2]">可分割 {areaText(record.divisible_area)}</p>
          )}
        </div>
      ),
    },
    {
      title: '厂房参数',
      key: 'params',
      width: 210,
      render: (_v, record) => (
        <div className="flex flex-wrap gap-1.5">
          {record.floor_height ? <PlainTag>{record.floor_height}m 层高</PlainTag> : null}
          {record.floor_load ? <PlainTag>{record.floor_load}t/㎡</PlainTag> : null}
          {record.transformer_capacity ? (
            <PlainTag>{record.transformer_capacity}kVA</PlainTag>
          ) : null}
          {record.has_crane === 1 ? (
            <PlainTag>{record.crane_tonnage ? `${record.crane_tonnage}t 行车` : '有行车'}</PlainTag>
          ) : null}
        </div>
      ),
    },
    {
      title: '资质条件',
      key: 'qualification',
      width: 150,
      render: (_v, record) => (
        <Space size={6} wrap>
          {record.fire_rating && <PlainTag>{record.fire_rating}</PlainTag>}
          {record.env_approved === 1 && <PlainTag>可环评</PlainTag>}
          {record.independent_yard === 1 && <PlainTag>独门独院</PlainTag>}
        </Space>
      ),
    },
    {
      title: '租金单价',
      dataIndex: 'rent_price',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.rent_price - b.rent_price,
      render: (v: number) => (
        <div className="tabular-nums">
          <span className="text-[13.5px] font-medium text-[#1D1D1F]">{money(v)}</span>
          <p className="text-[11.5px] text-[#AEAEB2]">元/㎡/月</p>
        </div>
      ),
    },
    {
      title: '物业费',
      dataIndex: 'property_fee',
      width: 100,
      align: 'right',
      render: (v: number) => <MoneyText value={v} tone="muted" className="text-[13px]" />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      align: 'center',
      render: (v: Factory['status']) => <StatusTag meta={FACTORY_STATUS[v]} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      align: 'center',
      render: (_v, record) => (
        <div className="flex items-center justify-center gap-1">
          {can('property', 'edit') && (
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
          {can('property', 'delete') && (
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
      {/* 筛选区 */}
      <PageCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[240px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">关键词</p>
            <Input
              allowClear
              placeholder="房源名称 / 地址 / 编号"
              value={draft.keyword as string}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              onPressEnter={() => {
                setFilters(draft)
                search(draft)
              }}
            />
          </div>

          <div className="w-[130px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">状态</p>
            <Select
              allowClear
              placeholder="全部"
              className="w-full"
              value={(draft.status as string) || undefined}
              onChange={(v) => setDraft({ ...draft, status: v ?? '' })}
              options={[
                { value: 'vacant', label: '待出租' },
                { value: 'rented', label: '已出租' },
                { value: 'disabled', label: '空置停用' },
              ]}
            />
          </div>

          <div className="w-[130px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">消防等级</p>
            <Select
              allowClear
              placeholder="全部"
              className="w-full"
              value={(draft.fire_rating as string) || undefined}
              onChange={(v) => setDraft({ ...draft, fire_rating: v ?? '' })}
              options={FIRE_RATINGS.map((v) => ({ value: v, label: v }))}
            />
          </div>

          <div className="w-[130px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">行车配置</p>
            <Select
              allowClear
              placeholder="全部"
              className="w-full"
              value={(draft.has_crane as string) || undefined}
              onChange={(v) => setDraft({ ...draft, has_crane: v ?? '' })}
              options={[
                { value: '1', label: '有行车' },
                { value: '0', label: '无行车' },
              ]}
            />
          </div>

          <div className="w-[130px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">环评</p>
            <Select
              allowClear
              placeholder="全部"
              className="w-full"
              value={(draft.env_approved as string) || undefined}
              onChange={(v) => setDraft({ ...draft, env_approved: v ?? '' })}
              options={[{ value: '1', label: '可环评' }]}
            />
          </div>

          <div className="w-[110px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">面积下限</p>
            <InputNumber
              min={0}
              className="w-full"
              placeholder="㎡"
              value={draft.min_area as number}
              onChange={(v) => setDraft({ ...draft, min_area: v ?? undefined })}
            />
          </div>

          <div className="w-[110px]">
            <p className="mb-1.5 text-[12px] text-[#86868B]">面积上限</p>
            <InputNumber
              min={0}
              className="w-full"
              placeholder="㎡"
              value={draft.max_area as number}
              onChange={(v) => setDraft({ ...draft, max_area: v ?? undefined })}
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

      {/* 列表区 */}
      <PageCard flush>
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          <div>
            <h2 className="text-[17px] font-semibold leading-6 text-[#1D1D1F]">厂房房源</h2>
            <p className="mt-1 text-[13px] text-[#86868B]">
              共 {total} 处房源 · 支持筛选、排序与 Excel 导出
            </p>
          </div>
          <Space>
            {can('property', 'export') && (
              <Button icon={<Download size={15} />} onClick={handleExport} loading={exporting}>
                导出 Excel
              </Button>
            )}
            {can('property', 'create') && (
              <Button
                type="primary"
                icon={<Plus size={15} />}
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                新增厂房
              </Button>
            )}
          </Space>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          scroll={{ x: 1420 }}
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

      <FactoryFormDrawer
        open={formOpen}
        record={editing}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />

      <Drawer
        title={detail ? `${detail.name} · ${detail.code}` : '厂房详情'}
        width={560}
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <Descriptions column={2} size="small" bordered={false} colon={false}>
            <Descriptions.Item label="详细地址" span={2}>
              {detail.address}
            </Descriptions.Item>
            <Descriptions.Item label="总建筑面积">{areaText(detail.total_area)} ㎡</Descriptions.Item>
            <Descriptions.Item label="可分割面积">
              {detail.divisible_area > 0 ? `${areaText(detail.divisible_area)} ㎡` : '不可分割'}
            </Descriptions.Item>
            <Descriptions.Item label="层高">{detail.floor_height ?? '—'} m</Descriptions.Item>
            <Descriptions.Item label="地面承重">{detail.floor_load ?? '—'} t/㎡</Descriptions.Item>
            <Descriptions.Item label="地坪类型">{detail.floor_type ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="变压器容量">
              {detail.transformer_capacity ?? '—'} kVA
            </Descriptions.Item>
            <Descriptions.Item label="行车配置">
              {detail.has_crane === 1 ? `有（${detail.crane_tonnage ?? '—'} t）` : '无'}
            </Descriptions.Item>
            <Descriptions.Item label="消防等级">{detail.fire_rating ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="可否环评">{detail.env_approved === 1 ? '可环评' : '不可'}</Descriptions.Item>
            <Descriptions.Item label="独门独院">{detail.independent_yard === 1 ? '是' : '否'}</Descriptions.Item>
            <Descriptions.Item label="配套宿舍">{detail.dorm_area ? `${areaText(detail.dorm_area)} ㎡` : '—'}</Descriptions.Item>
            <Descriptions.Item label="空地面积">{detail.yard_area ? `${areaText(detail.yard_area)} ㎡` : '—'}</Descriptions.Item>
            <Descriptions.Item label="大车进出" span={2}>
              {detail.truck_access ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="禁止入驻行业" span={2}>
              {detail.forbidden_industry ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="租金单价">
              <span className="font-medium">{money(detail.rent_price)}</span> 元/㎡/月
            </Descriptions.Item>
            <Descriptions.Item label="物业费">
              {money(detail.property_fee)} 元/㎡/月
            </Descriptions.Item>
            <Descriptions.Item label="水费">{detail.water_price ?? '—'} 元/吨</Descriptions.Item>
            <Descriptions.Item label="电费">{detail.electric_price ?? '—'} 元/度</Descriptions.Item>
            <Descriptions.Item label="最短租期">{detail.min_lease_months} 个月</Descriptions.Item>
            <Descriptions.Item label="分割转租">{detail.allow_sublet === 1 ? '允许' : '不允许'}</Descriptions.Item>
            <Descriptions.Item label="当前状态">
              <StatusTag meta={FACTORY_STATUS[detail.status]} />
            </Descriptions.Item>
            <Descriptions.Item label="生效租约">
              {detail.active_lease_count ?? 0} 份
            </Descriptions.Item>
            <Descriptions.Item label="房源说明" span={2}>
              {detail.remark ?? '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  )
}
