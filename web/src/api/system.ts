import type {
  Announcement,
  AppNotification,
  OperationLog,
  PageResult,
  Role,
  Setting,
  SysUser,
} from '../types'
import { http } from './client'

export const systemApi = {
  // ===== 基础设置 =====
  settings() {
    return http.get<Setting[]>('/system/settings')
  },
  saveSettings(payload: Record<string, string>) {
    return http.put<{ success: boolean }>('/system/settings', payload)
  },

  // ===== 公告 =====
  announcements(params: Record<string, unknown>) {
    return http.page<Announcement>('/system/announcements', params)
  },
  createAnnouncement(data: Partial<Announcement>) {
    return http.post<{ id: number }>('/system/announcements', data)
  },
  updateAnnouncement(id: number, data: Partial<Announcement>) {
    return http.put<{ success: boolean }>(`/system/announcements/${id}`, data)
  },
  removeAnnouncement(id: number) {
    return http.delete<{ success: boolean }>(`/system/announcements/${id}`)
  },

  // ===== 角色 =====
  roles() {
    return http.get<Role[]>('/system/roles')
  },
  createRole(data: Partial<Role>) {
    return http.post<{ id: number }>('/system/roles', data)
  },
  updateRole(id: number, data: Partial<Role>) {
    return http.put<{ success: boolean }>(`/system/roles/${id}`, data)
  },
  removeRole(id: number) {
    return http.delete<{ success: boolean }>(`/system/roles/${id}`)
  },

  // ===== 账号 =====
  users(params: Record<string, unknown>) {
    return http.page<SysUser>('/system/users', params)
  },
  createUser(data: Record<string, unknown>) {
    return http.post<{ id: number }>('/system/users', data)
  },
  updateUser(id: number, data: Record<string, unknown>) {
    return http.put<{ success: boolean }>(`/system/users/${id}`, data)
  },
  toggleUserStatus(id: number, status: 'active' | 'disabled') {
    return http.put<{ success: boolean }>(`/system/users/${id}/status`, { status })
  },
  resetPassword(id: number) {
    return http.post<{ success: boolean; defaultPassword: string }>(
      `/system/users/${id}/reset-password`,
    )
  },
  removeUser(id: number) {
    return http.delete<{ success: boolean }>(`/system/users/${id}`)
  },

  // ===== 操作日志 =====
  logs(params: Record<string, unknown>) {
    return http.page<OperationLog>('/system/logs', params)
  },

  // ===== 站内消息 =====
  notifications() {
    return http.get<{ list: AppNotification[]; unread: number }>('/system/notifications')
  },
  readNotification(id: number) {
    return http.post<{ success: boolean }>(`/system/notifications/${id}/read`)
  },
  readAllNotifications() {
    return http.post<{ success: boolean }>('/system/notifications/read-all')
  },
}

export type { PageResult }
