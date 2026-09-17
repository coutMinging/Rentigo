import type { Lease, LeaseDetail, PlanPreview, PropertyType, SettlementResult } from '../types'
import { download, http } from './client'

export interface LeaseCreatePayload {
  tenant_id: number
  property_type: PropertyType
  properties: number[]
  start_date: string
  end_date: string
  pay_cycle: 'month' | 'quarter' | 'year'
  deposit_amount: number
  decoration_total: number
  decoration_periods: number
  decoration_per_month?: number
  sign_date?: string
  extra_clause?: string
  remark?: string
}

export interface SettlementPayload {
  terminate_date: string
  water_fee: number
  electric_fee: number
  other_fee: number
  deposit_offset: boolean
  remark?: string
}

export const leaseApi = {
  list(params: Record<string, unknown>) {
    return http.page<Lease>('/leases', params)
  },
  detail(id: number) {
    return http.get<LeaseDetail>(`/leases/${id}`)
  },
  create(data: LeaseCreatePayload) {
    return http.post<{
      id: number
      lease_no: string
      bill_count: number
      monthly_rent: number
      monthly_property_fee: number
    }>('/leases', data)
  },
  update(id: number, data: Record<string, unknown>) {
    return http.put<{ success: boolean }>(`/leases/${id}`, data)
  },
  /** 装修抵扣实时试算（不落库） */
  preview(data: {
    property_type: PropertyType
    properties: number[]
    start_date: string
    end_date: string
    pay_cycle: string
    decoration_total: number
    decoration_periods: number
    decoration_per_month?: number
  }) {
    return http.post<PlanPreview>('/leases/preview', data, { silent: true })
  },
  regenerateBills(id: number) {
    return http.post<{ count: number; totalDeduction: number }>(`/leases/${id}/regenerate-bills`)
  },
  settlement(id: number, data: SettlementPayload) {
    return http.post<SettlementResult>(`/leases/${id}/settlement`, data)
  },
  terminate(id: number, data: SettlementPayload) {
    return http.post<SettlementResult>(`/leases/${id}/terminate`, data)
  },
  markBreach(id: number, reason: string) {
    return http.post<{ success: boolean }>(`/leases/${id}/mark-breach`, { reason })
  },
  contract(id: number, kind?: string) {
    return http.get<{
      kind: string
      html: string
      available_kinds: string[]
      has_decoration: boolean
    }>(`/leases/${id}/contract`, kind ? { kind } : undefined)
  },
  export(params: Record<string, unknown>) {
    return download('/leases/export', params, '租约合同.xlsx')
  },
}
