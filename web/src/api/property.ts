import type {
  Apartment,
  ApartmentTreeNode,
  Building,
  Factory,
  PageResult,
  Tenant,
  TenantDetail,
} from '../types'
import { download, http } from './client'

export const factoryApi = {
  list(params: Record<string, unknown>) {
    return http.page<Factory>('/factories', params)
  },
  options() {
    return http.get<Array<Pick<Factory, 'id' | 'code' | 'name' | 'total_area' | 'rent_price' | 'property_fee' | 'status'>>>(
      '/factories/options',
    )
  },
  detail(id: number) {
    return http.get<Factory>(`/factories/${id}`)
  },
  create(data: Partial<Factory>) {
    return http.post<{ id: number; code: string }>('/factories', data)
  },
  update(id: number, data: Partial<Factory>) {
    return http.put<{ success: boolean }>(`/factories/${id}`, data)
  },
  remove(id: number) {
    return http.delete<{ success: boolean }>(`/factories/${id}`)
  },
  export(params: Record<string, unknown>) {
    return download('/factories/export', params, '厂房房源.xlsx')
  },
}

export const apartmentApi = {
  buildings() {
    return http.get<Building[]>('/apartments/buildings')
  },
  createBuilding(data: Partial<Building>) {
    return http.post<{ id: number }>('/apartments/buildings', data)
  },
  updateBuilding(id: number, data: Partial<Building>) {
    return http.put<{ success: boolean }>(`/apartments/buildings/${id}`, data)
  },
  removeBuilding(id: number) {
    return http.delete<{ success: boolean }>(`/apartments/buildings/${id}`)
  },
  tree() {
    return http.get<ApartmentTreeNode[]>('/apartments/tree')
  },
  rooms(params: Record<string, unknown>) {
    return http.page<Apartment>('/apartments/rooms', params)
  },
  roomOptions() {
    return http.get<Array<Pick<Apartment, 'id' | 'code' | 'building_name' | 'floor' | 'room_no' | 'layout' | 'area' | 'monthly_rent' | 'property_fee' | 'status'>>>(
      '/apartments/rooms/options',
    )
  },
  createRoom(data: Partial<Apartment>) {
    return http.post<{ id: number; code: string }>('/apartments/rooms', data)
  },
  updateRoom(id: number, data: Partial<Apartment>) {
    return http.put<{ success: boolean }>(`/apartments/rooms/${id}`, data)
  },
  removeRoom(id: number) {
    return http.delete<{ success: boolean }>(`/apartments/rooms/${id}`)
  },
  batchCreate(data: Record<string, unknown>) {
    return http.post<{ created: number; skipped: number }>('/apartments/rooms/batch', data)
  },
  batchUpdate(data: Record<string, unknown>) {
    return http.post<{ updated: number }>('/apartments/rooms/batch-update', data)
  },
  export(params: Record<string, unknown>) {
    return download('/apartments/rooms/export', params, '公寓房源.xlsx')
  },
}

export const tenantApi = {
  list(params: Record<string, unknown>) {
    return http.page<Tenant>('/tenants', params)
  },
  options() {
    return http.get<Array<Pick<Tenant, 'id' | 'type' | 'name' | 'contact_name' | 'phone'>>>(
      '/tenants/options',
    )
  },
  detail(id: number) {
    return http.get<TenantDetail>(`/tenants/${id}`)
  },
  create(data: Partial<Tenant>) {
    return http.post<{ id: number }>('/tenants', data)
  },
  update(id: number, data: Partial<Tenant>) {
    return http.put<{ success: boolean }>(`/tenants/${id}`, data)
  },
  remove(id: number) {
    return http.delete<{ success: boolean }>(`/tenants/${id}`)
  },
  export(params: Record<string, unknown>) {
    return download('/tenants/export', params, '租客档案.xlsx')
  },
}

export type { PageResult }
