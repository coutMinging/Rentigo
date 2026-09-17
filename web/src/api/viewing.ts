import type {
  PageResult,
  PropertyType,
  Viewing,
  ViewingDetail,
  ViewingStats,
  ViewingStatus,
} from '../types'
import { download, http } from './client'

export interface ViewingPayload {
  tenant_id?: number | null
  tenant_name: string
  phone: string
  property_type: PropertyType
  property_id?: number | null
  appoint_time?: string | null
  status?: ViewingStatus
  remark?: string | null
}

/** 列表响应比通用分页多一个状态统计字段 */
export type ViewingPage = PageResult<Viewing> & { stats: ViewingStats }

export const viewingApi = {
  list(params: Record<string, unknown>) {
    return http.get<ViewingPage>('/viewings', params)
  },
  detail(id: number) {
    return http.get<ViewingDetail>(`/viewings/${id}`)
  },
  create(data: ViewingPayload) {
    return http.post<{ id: number }>('/viewings', data)
  },
  update(id: number, data: ViewingPayload) {
    return http.put<{ success: boolean }>(`/viewings/${id}`, data)
  },
  /** 状态流转；转为签约时携带关联租约 id */
  updateStatus(id: number, status: ViewingStatus, leaseId?: number | null) {
    return http.put<{ success: boolean }>(`/viewings/${id}/status`, {
      status,
      lease_id: leaseId ?? null,
    })
  },
  addFollowUp(id: number, content: string, followUpAt?: string | null) {
    return http.post<{ id: number }>(`/viewings/${id}/follow-ups`, {
      content,
      follow_up_at: followUpAt ?? null,
    })
  },
  remove(id: number) {
    return http.delete<{ success: boolean }>(`/viewings/${id}`)
  },
  export(params: Record<string, unknown>) {
    return download('/viewings/export', params, '看房预约台账.xlsx')
  },
}

export type { PageResult }
