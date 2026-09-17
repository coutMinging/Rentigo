import type {
  PageResult,
  PropertyType,
  WorkOrder,
  WorkOrderPropertyStat,
  WorkOrderStats,
  WorkOrderStatus,
} from '../types'
import { download, http } from './client'

/** 新建 / 编辑工单的基础信息，状态与维修信息走 updateStatus */
export interface WorkOrderPayload {
  property_type: PropertyType
  property_id?: number | null
  reporter: string
  phone?: string | null
  fault_desc: string
  images?: string[]
}

/** 状态流转入参：未传的字段后端沿用原值，支持只补充维修进度 */
export interface WorkOrderStatusPayload {
  status: WorkOrderStatus
  assignee?: string | null
  progress?: string | null
  cost?: number | null
  finish_remark?: string | null
}

/** 列表响应比通用分页多一个统计字段 */
export type WorkOrderPage = PageResult<WorkOrder> & { stats: WorkOrderStats }

export const workOrderApi = {
  list(params: Record<string, unknown>) {
    return http.get<WorkOrderPage>('/work-orders', params)
  },
  detail(id: number) {
    return http.get<WorkOrder>(`/work-orders/${id}`)
  },
  /** 按房源聚合的维修频次与成本，用于页头统计面板 */
  stats(params?: Record<string, unknown>) {
    return http.get<{ list: WorkOrderPropertyStat[] }>('/work-orders/stats', params)
  },
  create(data: WorkOrderPayload) {
    return http.post<{ id: number; order_no: string }>('/work-orders', data)
  },
  update(id: number, data: WorkOrderPayload) {
    return http.put<{ success: boolean }>(`/work-orders/${id}`, data)
  },
  updateStatus(id: number, data: WorkOrderStatusPayload) {
    return http.put<{ success: boolean }>(`/work-orders/${id}/status`, data)
  },
  remove(id: number) {
    return http.delete<{ success: boolean }>(`/work-orders/${id}`)
  },
  export(params: Record<string, unknown>) {
    return download('/work-orders/export', params, '报修工单台账.xlsx')
  },
}

export type { WorkOrder }
