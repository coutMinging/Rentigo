import { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, Form, Input, Modal, Select, Space, Switch, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { systemApi } from '../../api/system'
import { feedback } from '../../api/feedback'
import { MoneyText } from '../../components/DataDisplay'
import { SectionTitle } from '../../components/Surface'
import { usePermission, useTableQuery } from '../../hooks'
import { MODULE_LABEL, OPERATION_ACTION, PERMISSION_ACTIONS } from '../../utils/constants'
import { dateText, dateTimeText } from '../../utils/format'
import type { OperationLog, Role, SysUser } from '../../types'

// ==================== 角色权限 ====================

const PERMISSION_MODULES = ['dashboard', 'property', 'tenant', 'lease', 'bill', 'workOrder', 'viewing', 'system']

export function RolePanel() {
  const can = usePermission()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const [form] = Form.useForm()

  const load = useCallback(() => {
    setLoading(true)
    systemApi
      .roles()
      .then(setRoles)
      .catch((err) => console.error('[role] 加载失败:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openModal = (record: Role | null) => {
    setEditing(record)
    setModalOpen(true)
    if (record) {
      form.setFieldsValue({
        name: record.name,
        code: record.code,
        remark: record.remark,
        permissions: record.permissions,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ permissions: {} })
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    // 只保留勾选了动作的模块，避免存一堆空数组
    const permissions: Record<string, string[]> = {}
    for (const [module, actions] of Object.entries(values.permissions ?? {})) {
      const list = (actions as string[]) ?? []
      if (list.length > 0) permissions[module] = list
    }

    try {
      if (editing) {
        await systemApi.updateRole(editing.id, { ...values, permissions })
        feedback.success('角色权限已更新')
      } else {
        await systemApi.createRole({ ...values, permissions })
        feedback.success('角色已新增')
      }
      setModalOpen(false)
      load()
    } catch (err) {
      console.error('[role] 保存失败:', err)
    }
  }

  const handleDelete = async (record: Role) => {
    const confirmed = await feedback.confirm('删除角色', `将删除「${record.name}」，该角色下不能有账号。`)
    if (!confirmed) return
    try {
      await systemApi.removeRole(record.id)
      feedback.success('角色已删除')
      load()
    } catch (err) {
      console.error('[role] 删除失败:', err)
    }
  }

  return (
    <div className="pt-2">
      <SectionTitle
        title="角色与权限"
        subtitle="权限粒度为「模块 × 操作」，财务与运维角色的可见范围由这里控制"
        extra={
          can('system', 'create') ? (
            <Button type="primary" icon={<Plus size={15} />} onClick={() => openModal(null)}>
              新增角色
            </Button>
          ) : undefined
        }
      />

      <div className="mt-5 space-y-3">
        {roles.map((role) => (
          <div key={role.id} className="rounded-2xl border border-black/[0.06] px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-[14.5px] font-semibold text-[#1D1D1F]">{role.name}</span>
                <span className="rounded-md bg-black/[0.05] px-1.5 py-[2px] text-[11px] text-[#6E6E73]">
                  {role.code}
                </span>
                {role.is_preset === 1 && (
                  <span className="rounded-md bg-[rgba(0,102,204,0.09)] px-1.5 py-[2px] text-[11px] text-[#0066CC]">
                    预设角色
                  </span>
                )}
                <span className="text-[12px] text-[#AEAEB2]">{role.user_count ?? 0} 个账号</span>
              </div>
              <div className="flex gap-1">
                {can('system', 'edit') && (
                  <Tooltip title="编辑权限">
                    <Button type="text" size="small" icon={<Pencil size={15} />} onClick={() => openModal(role)} />
                  </Tooltip>
                )}
                {can('system', 'delete') && role.is_preset !== 1 && (
                  <Tooltip title="删除角色">
                    <Button type="text" size="small" danger icon={<Trash2 size={15} />} onClick={() => handleDelete(role)} />
                  </Tooltip>
                )}
              </div>
            </div>

            {role.remark && <p className="mt-1.5 text-[12.5px] text-[#86868B]">{role.remark}</p>}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {PERMISSION_MODULES.filter((m) => (role.permissions[m] ?? []).length > 0).map((m) => (
                <Tag key={m} bordered={false}>
                  {MODULE_LABEL[m] ?? m}：
                  {(role.permissions[m] ?? [])
                    .filter((a) => a !== '*')
                    .map((a) => PERMISSION_ACTIONS.find((p) => p.key === a)?.label ?? a)
                    .join('/') || '全部'}
                </Tag>
              ))}
              {Object.keys(role.permissions).length === 0 && (
                <span className="text-[12.5px] text-[#AEAEB2]">未配置任何模块权限</span>
              )}
            </div>
          </div>
        ))}
        {!loading && roles.length === 0 && (
          <p className="py-8 text-center text-[13px] text-[#AEAEB2]">暂无角色</p>
        )}
      </div>

      <Modal
        title={editing ? `编辑角色 · ${editing.name}` : '新增角色'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        width={720}
        okText="保存"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
              <Input placeholder="如：园区招商专员" />
            </Form.Item>
            <Form.Item
              name="code"
              label="角色标识"
              rules={[
                { required: true, message: '请输入角色标识' },
                { pattern: /^[a-z][a-z0-9_]*$/, message: '只能用小写字母、数字和下划线' },
              ]}
            >
              <Input placeholder="如：leasing" disabled={editing?.is_preset === 1} />
            </Form.Item>
          </div>

          <Form.Item name="remark" label="角色说明">
            <Input placeholder="描述该角色的职责范围" />
          </Form.Item>

          <p className="mb-3 text-[13px] text-[#6E6E73]">模块操作权限</p>
          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {PERMISSION_MODULES.map((module) => (
              <div key={module} className="rounded-xl border border-black/[0.06] px-4 py-2.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="w-[90px] text-[13px] font-medium text-[#1D1D1F]">
                    {MODULE_LABEL[module]}
                  </span>
                  <Form.Item name={['permissions', module]} noStyle>
                    <Checkbox.Group
                      options={PERMISSION_ACTIONS.map((a) => ({ value: a.key, label: a.label }))}
                    />
                  </Form.Item>
                </div>
              </div>
            ))}
          </div>
        </Form>
      </Modal>
    </div>
  )
}

// ==================== 账号管理 ====================

export function UserPanel() {
  const can = usePermission()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SysUser | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [form] = Form.useForm()

  const { list, total, loading, page, pageSize, search, refresh, changePage } = useTableQuery<SysUser>({
    fetcher: (p) => systemApi.users(p),
    defaultFilters: { keyword: '' },
  })

  useEffect(() => {
    systemApi.roles().then(setRoles).catch(() => undefined)
  }, [])

  const openModal = (record: SysUser | null) => {
    setEditing(record)
    setModalOpen(true)
    if (record) {
      form.setFieldsValue({ ...record, password: undefined })
    } else {
      form.resetFields()
      form.setFieldsValue({ status: 'active', password: '123456' })
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    try {
      if (editing) {
        await systemApi.updateUser(editing.id, values)
        feedback.success('账号信息已更新')
      } else {
        await systemApi.createUser(values)
        feedback.success('账号已新增')
      }
      setModalOpen(false)
      refresh()
    } catch (err) {
      console.error('[user] 保存失败:', err)
    }
  }

  const handleReset = async (record: SysUser) => {
    const confirmed = await feedback.confirm('重置密码', `将「${record.real_name}」的密码重置为 123456。`)
    if (!confirmed) return
    await systemApi.resetPassword(record.id)
    feedback.success('密码已重置为 123456')
  }

  const columns: ColumnsType<SysUser> = [
    { title: '账号', dataIndex: 'username', width: 150 },
    { title: '姓名', dataIndex: 'real_name', width: 140 },
    { title: '电话', dataIndex: 'phone', width: 150, render: (v: string | null) => v ?? '—' },
    { title: '角色', dataIndex: 'role_name', width: 160 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v: string) =>
        v === 'active' ? (
          <span className="text-[13px] text-[#1D9A4E]">已启用</span>
        ) : (
          <span className="text-[13px] text-[#D70015]">已禁用</span>
        ),
    },
    {
      title: '最近登录',
      dataIndex: 'last_login_at',
      width: 180,
      render: (v: string | null) => <span className="text-[13px] text-[#86868B]">{dateTimeText(v)}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      align: 'center',
      render: (_v, record) => (
        <Space size={4}>
          {can('system', 'edit') && (
            <>
              <Button type="text" size="small" onClick={() => openModal(record)}>
                编辑
              </Button>
              <Button type="text" size="small" icon={<RotateCcw size={14} />} onClick={() => handleReset(record)}>
                重置密码
              </Button>
              <Switch
                size="small"
                checked={record.status === 'active'}
                onChange={(checked) =>
                  systemApi
                    .toggleUserStatus(record.id, checked ? 'active' : 'disabled')
                    .then(() => {
                      feedback.success(checked ? '账号已启用' : '账号已禁用')
                      refresh()
                    })
                    .catch((err) => console.error('[user] 状态切换失败:', err))
                }
              />
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="pt-2">
      <SectionTitle
        title="账号管理"
        subtitle="新增、启用禁用、重置密码；所有写操作都会记录到操作日志"
        extra={
          <div className="flex gap-2">
            <Input.Search
              allowClear
              placeholder="搜索账号 / 姓名 / 电话"
              className="!w-[220px]"
              onSearch={(v) => search({ keyword: v })}
            />
            {can('system', 'create') && (
              <Button type="primary" icon={<Plus size={15} />} onClick={() => openModal(null)}>
                新增账号
              </Button>
            )}
          </div>
        }
      />

      <Table
        rowKey="id"
        className="mt-5"
        columns={columns}
        dataSource={list}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showTotal: (t) => `共 ${t} 个账号`,
          onChange: changePage,
        }}
      />

      <Modal
        title={editing ? `编辑账号 · ${editing.username}` : '新增账号'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        width={520}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="username"
            label="登录账号"
            rules={[{ required: true, message: '请输入登录账号' }, { min: 3, message: '至少 3 位' }]}
          >
            <Input placeholder="如：leasing01" />
          </Form.Item>
          <Form.Item name="real_name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="如：张三" />
          </Form.Item>
          <Form.Item name="phone" label="联系电话">
            <Input placeholder="如：13900001111" />
          </Form.Item>
          <Form.Item name="role_id" label="所属角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={roles.map((r) => ({ value: r.id, label: r.name }))} />
          </Form.Item>
          {!editing && (
            <Form.Item
              name="password"
              label="初始密码"
              rules={[{ required: true, message: '请输入初始密码' }, { min: 6, message: '至少 6 位' }]}
            >
              <Input placeholder="默认 123456，建议首次登录后修改" />
            </Form.Item>
          )}
          <Form.Item name="status" label="账号状态">
            <Select
              options={[
                { value: 'active', label: '启用' },
                { value: 'disabled', label: '禁用' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ==================== 操作日志 ====================

export function LogPanel() {
  const [keyword, setKeyword] = useState('')
  const [module, setModule] = useState<string>('')
  const [range, setRange] = useState<[string, string] | null>(null)

  const { list, total, loading, page, pageSize, search, changePage } = useTableQuery<OperationLog>({
    fetcher: (p) =>
      systemApi.logs({
        keyword: p.keyword,
        module: p.module,
        start_date: p.start_date,
        end_date: p.end_date,
        page: p.page,
        pageSize: p.pageSize,
      }),
    defaultFilters: { keyword: '', module: '', start_date: undefined, end_date: undefined },
  })

  const columns: ColumnsType<OperationLog> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v: string) => <span className="text-[12.5px] text-[#6E6E73]">{v}</span>,
    },
    { title: '操作人', dataIndex: 'username', width: 120 },
    {
      title: '模块',
      dataIndex: 'module',
      width: 120,
      render: (v: string) => <span className="text-[13px]">{MODULE_LABEL[v] ?? v}</span>,
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: 100,
      render: (v: string) => OPERATION_ACTION[v] ?? v,
    },
    { title: '操作对象', dataIndex: 'target', width: 200, render: (v: string | null) => v ?? '—' },
    { title: '变更摘要', dataIndex: 'detail', ellipsis: true, render: (v: string | null) => v ?? '—' },
    { title: 'IP', dataIndex: 'ip', width: 140, render: (v: string | null) => v ?? '—' },
  ]

  return (
    <div className="pt-2">
      <SectionTitle
        title="操作日志"
        subtitle="新增、修改、删除、导出等写操作永久留痕，可按模块与关键词检索"
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Input.Search
          allowClear
          placeholder="搜索操作人 / 对象 / 摘要"
          className="!w-[260px]"
          onSearch={(v) => {
            setKeyword(v)
            search({ keyword: v, module, start_date: range?.[0], end_date: range?.[1] })
          }}
        />
        <Select
          allowClear
          placeholder="全部模块"
          className="!w-[160px]"
          value={module || undefined}
          onChange={(v) => {
            setModule(v ?? '')
            search({ keyword, module: v ?? '', start_date: range?.[0], end_date: range?.[1] })
          }}
          options={Object.entries(MODULE_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <Table
        rowKey="id"
        className="mt-4"
        size="middle"
        columns={columns}
        dataSource={list}
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: changePage,
        }}
      />
    </div>
  )
}

export { MoneyText, dateText }
