import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Select, Space, Table, Tooltip, Tree } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Download, Layers, Pencil, Plus, Trash2, Wand2 } from 'lucide-react'
import { apartmentApi } from '../../api/property'
import { feedback } from '../../api/feedback'
import { MoneyText } from '../../components/DataDisplay'
import { EmptyHint, PageCard } from '../../components/Surface'
import { StatusTag } from '../../components/StatusTag'
import { usePermission } from '../../hooks'
import { APARTMENT_STATUS, LAYOUTS } from '../../utils/constants'
import { areaText, money } from '../../utils/format'
import type { Apartment, ApartmentTreeNode, Building } from '../../types'
import RoomFormDrawer from './RoomFormDrawer'
import { BatchCreateModal, BatchUpdateModal, BuildingModal } from './BatchModals'

export default function ApartmentsPage() {
  const can = usePermission()

  const [tree, setTree] = useState<ApartmentTreeNode[]>([])
  const [rooms, setRooms] = useState<Apartment[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selectedRoomIds, setSelectedRoomIds] = useState<number[]>([])

  const [roomFormOpen, setRoomFormOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Apartment | null>(null)
  const [batchCreateOpen, setBatchCreateOpen] = useState(false)
  const [batchUpdateOpen, setBatchUpdateOpen] = useState(false)
  const [buildingModalOpen, setBuildingModalOpen] = useState(false)
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null)

  const buildings = useMemo<Building[]>(
    () => tree.map(({ children: _children, ...rest }) => rest),
    [tree],
  )

  /** 当前选中的筛选维度 */
  const scope = useMemo(() => {
    const key = selectedKeys[0]
    if (!key) return { buildingId: undefined as number | undefined, floor: undefined as number | undefined }
    if (key.startsWith('b-')) return { buildingId: Number(key.slice(2)), floor: undefined }
    if (key.startsWith('f-')) {
      const [, buildingId, floor] = key.split('-')
      return { buildingId: Number(buildingId), floor: Number(floor) }
    }
    return { buildingId: undefined, floor: undefined }
  }, [selectedKeys])

  const loadTree = useCallback(() => {
    apartmentApi
      .tree()
      .then(setTree)
      .catch((err) => console.error('[apartment] 楼栋树加载失败:', err))
  }, [])

  const loadRooms = useCallback(() => {
    setLoading(true)
    apartmentApi
      .rooms({
        building_id: scope.buildingId,
        floor: scope.floor,
        status: statusFilter || undefined,
        keyword: keyword || undefined,
        pageSize: 200,
      })
      .then((res) => setRooms(res.list))
      .catch((err) => console.error('[apartment] 房间加载失败:', err))
      .finally(() => setLoading(false))
  }, [scope.buildingId, scope.floor, statusFilter, keyword])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  useEffect(() => {
    loadRooms()
    setSelectedRoomIds([])
  }, [loadRooms])

  const treeData = useMemo(
    () => [
      {
        key: 'all',
        title: (
          <span className="text-[13.5px] font-medium">
            全部房间
            <span className="ml-2 text-[12px] text-[#AEAEB2]">
              {tree.reduce((s, b) => s + b.room_count, 0)} 间
            </span>
          </span>
        ),
        children: tree.map((building) => ({
          key: `b-${building.id}`,
          title: (
            <span className="text-[13.5px]">
              {building.name}
              <span className="ml-2 text-[12px] text-[#AEAEB2]">
                已租 {building.rented_count} / {building.room_count}
              </span>
            </span>
          ),
          children: building.children.map((floor) => ({
            key: `f-${building.id}-${floor.floor}`,
            title: (
              <span className="text-[13px] text-[#6E6E73]">
                {floor.label}
                <span className="ml-2 text-[11.5px] text-[#AEAEB2]">{floor.rooms.length} 间</span>
              </span>
            ),
          })),
        })),
      },
    ],
    [tree],
  )

  const handleDeleteRoom = async (record: Apartment) => {
    const confirmed = await feedback.confirm(
      '确认删除房间',
      `将删除房间「${record.code}」，删除后不可恢复。存在生效租约时会拒绝删除。`,
    )
    if (!confirmed) return

    try {
      await apartmentApi.removeRoom(record.id)
      feedback.success('房间已删除')
      loadTree()
      loadRooms()
    } catch (err) {
      console.error('[apartment] 删除失败:', err)
    }
  }

  const handleDeleteBuilding = async () => {
    if (!scope.buildingId) {
      feedback.warning('请先在左侧选择一个楼栋')
      return
    }
    const building = buildings.find((b) => b.id === scope.buildingId)
    if (!building) return

    const confirmed = await feedback.confirm(
      '确认删除楼栋',
      `将删除「${building.name}」。楼栋下若仍有房间，系统会拒绝删除。`,
    )
    if (!confirmed) return

    try {
      await apartmentApi.removeBuilding(building.id)
      feedback.success('楼栋已删除')
      setSelectedKeys([])
      loadTree()
    } catch (err) {
      console.error('[building] 删除失败:', err)
    }
  }

  const columns: ColumnsType<Apartment> = [
    {
      title: '房间号',
      dataIndex: 'code',
      width: 120,
      fixed: 'left',
      render: (v: string, record) => (
        <div>
          <span className="text-[13.5px] font-medium text-[#1D1D1F]">{record.room_no}</span>
          <p className="mt-0.5 text-[11.5px] text-[#AEAEB2]">{v}</p>
        </div>
      ),
    },
    {
      title: '楼栋 / 楼层',
      key: 'location',
      width: 180,
      render: (_v, record) => (
        <span className="text-[13px] text-[#6E6E73]">
          {record.building_name}
          <span className="ml-1.5 text-[#AEAEB2]">{record.floor} 层</span>
        </span>
      ),
    },
    {
      title: '户型',
      dataIndex: 'layout',
      width: 130,
      render: (v: string | null) => <span className="text-[13px] text-[#6E6E73]">{v ?? '—'}</span>,
    },
    {
      title: '面积 / 朝向',
      key: 'area',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.area - b.area,
      render: (_v, record) => (
        <div className="tabular-nums">
          <span className="text-[13px] text-[#1D1D1F]">{areaText(record.area)} ㎡</span>
          <p className="text-[11.5px] text-[#AEAEB2]">{record.orientation ?? '—'}向</p>
        </div>
      ),
    },
    {
      title: '家具家电',
      dataIndex: 'furniture',
      width: 220,
      ellipsis: true,
      render: (v: string | null) => (
        <span className="text-[12.5px] text-[#86868B]">{v ?? '—'}</span>
      ),
    },
    {
      title: '月租金',
      dataIndex: 'monthly_rent',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.monthly_rent - b.monthly_rent,
      render: (v: number) => (
        <div className="tabular-nums">
          <span className="text-[13.5px] font-medium text-[#1D1D1F]">{money(v)}</span>
          <p className="text-[11.5px] text-[#AEAEB2]">押金另计</p>
        </div>
      ),
    },
    {
      title: '押金',
      dataIndex: 'deposit_amount',
      width: 110,
      align: 'right',
      render: (v: number) => <MoneyText value={v} tone="muted" className="text-[13px]" />,
    },
    {
      title: '水电',
      key: 'utility',
      width: 120,
      render: (_v, record) => (
        <div className="text-[12px] text-[#6E6E73]">
          <p>{record.utility_type === 'civil' ? '民用' : '商用'}</p>
          <p className="text-[11.5px] text-[#AEAEB2]">
            {record.water_price ?? '—'}/{record.electric_price ?? '—'}
          </p>
        </div>
      ),
    },
    {
      title: '限制',
      key: 'limit',
      width: 110,
      render: (_v, record) => (
        <div className="text-[12px] text-[#6E6E73]">
          <p>{record.occupancy_limit ? `限 ${record.occupancy_limit} 人` : '不限人数'}</p>
          <p className="text-[11.5px] text-[#AEAEB2]">
            {record.allow_pet === 1 ? '可养宠' : '不可养宠'}
          </p>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      align: 'center',
      render: (v: Apartment['status']) => <StatusTag meta={APARTMENT_STATUS[v]} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
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
                  setEditingRoom(record)
                  setRoomFormOpen(true)
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
                onClick={() => handleDeleteRoom(record)}
              />
            </Tooltip>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex gap-5">
      {/* 左侧：楼栋-楼层树 */}
      <PageCard className="!w-[300px] shrink-0 self-start">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold leading-6 text-[#1D1D1F]">楼栋结构</h2>
            <p className="mt-0.5 text-[12px] text-[#86868B]">按楼层定位房间</p>
          </div>
          {can('property', 'create') && (
            <Tooltip title="新增楼栋">
              <Button
                type="text"
                size="small"
                icon={<Plus size={16} />}
                onClick={() => {
                  setEditingBuilding(null)
                  setBuildingModalOpen(true)
                }}
              />
            </Tooltip>
          )}
        </div>

        <Tree
          blockNode
          defaultExpandAll
          selectedKeys={selectedKeys}
          treeData={treeData}
          onSelect={(keys) => setSelectedKeys(keys as string[])}
        />

        {scope.buildingId && (
          <div className="mt-4 flex gap-2 border-t border-black/[0.06] pt-4">
            {can('property', 'edit') && (
              <Button
                size="small"
                icon={<Pencil size={14} />}
                onClick={() => {
                  setEditingBuilding(buildings.find((b) => b.id === scope.buildingId) ?? null)
                  setBuildingModalOpen(true)
                }}
              >
                编辑楼栋
              </Button>
            )}
            {can('property', 'delete') && (
              <Button size="small" danger icon={<Trash2 size={14} />} onClick={handleDeleteBuilding}>
                删除
              </Button>
            )}
          </div>
        )}
      </PageCard>

      {/* 右侧：房间表 */}
      <div className="min-w-0 flex-1 space-y-5">
        <PageCard>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[220px]">
              <p className="mb-1.5 text-[12px] text-[#86868B]">搜索</p>
              <Input
                allowClear
                placeholder="房间号 / 编号 / 户型"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <div className="w-[130px]">
              <p className="mb-1.5 text-[12px] text-[#86868B]">状态</p>
              <Select
                allowClear
                placeholder="全部"
                className="w-full"
                value={statusFilter || undefined}
                onChange={(v) => setStatusFilter(v ?? '')}
                options={[
                  { value: 'vacant', label: '空置' },
                  { value: 'rented', label: '已租' },
                  { value: 'repair', label: '待维修' },
                ]}
              />
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                icon={<Wand2 size={15} />}
                disabled={selectedRoomIds.length === 0}
                onClick={() => setBatchUpdateOpen(true)}
              >
                批量修改{selectedRoomIds.length > 0 ? `（${selectedRoomIds.length}）` : ''}
              </Button>
              {can('property', 'create') && (
                <Button icon={<Layers size={15} />} onClick={() => setBatchCreateOpen(true)}>
                  批量录入
                </Button>
              )}
              {can('property', 'export') && (
                <Button
                  icon={<Download size={15} />}
                  onClick={() => apartmentApi.export({ building_id: scope.buildingId, floor: scope.floor })}
                >
                  导出
                </Button>
              )}
              {can('property', 'create') && (
                <Button
                  type="primary"
                  icon={<Plus size={15} />}
                  onClick={() => {
                    setEditingRoom(null)
                    setRoomFormOpen(true)
                  }}
                >
                  新增房间
                </Button>
              )}
            </div>
          </div>
        </PageCard>

        <PageCard flush>
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <h2 className="text-[17px] font-semibold leading-6 text-[#1D1D1F]">房间列表</h2>
              <p className="mt-1 text-[13px] text-[#86868B]">
                共 {rooms.length} 间
                {selectedRoomIds.length > 0 && ` · 已选 ${selectedRoomIds.length} 间`}
              </p>
            </div>
          </div>

          {rooms.length === 0 && !loading ? (
            <EmptyHint
              title="该范围内暂无房间"
              description="可以先新增楼栋，再用「批量录入」一次性生成整层的房间"
            />
          ) : (
            <Table
              rowKey="id"
              columns={columns}
              dataSource={rooms}
              loading={loading}
              scroll={{ x: 1420 }}
              rowSelection={
                can('property', 'edit')
                  ? {
                      selectedRowKeys: selectedRoomIds,
                      onChange: (keys) => setSelectedRoomIds(keys as number[]),
                    }
                  : undefined
              }
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 间` }}
            />
          )}
        </PageCard>
      </div>

      {/* 表单与批量弹窗 */}
      <RoomFormDrawer
        open={roomFormOpen}
        record={editingRoom}
        buildings={buildings}
        defaultBuildingId={scope.buildingId}
        onClose={() => setRoomFormOpen(false)}
        onSaved={() => {
          loadTree()
          loadRooms()
        }}
      />

      <BatchCreateModal
        open={batchCreateOpen}
        buildings={buildings}
        defaultBuildingId={scope.buildingId}
        onClose={() => setBatchCreateOpen(false)}
        onSaved={() => {
          loadTree()
          loadRooms()
        }}
      />

      <BatchUpdateModal
        open={batchUpdateOpen}
        rooms={rooms.filter((r) => selectedRoomIds.includes(r.id))}
        onClose={() => setBatchUpdateOpen(false)}
        onSaved={() => {
          setSelectedRoomIds([])
          loadTree()
          loadRooms()
        }}
      />

      <BuildingModal
        open={buildingModalOpen}
        record={editingBuilding}
        onClose={() => setBuildingModalOpen(false)}
        onSaved={loadTree}
      />
    </div>
  )
}
