import type { AuthUser } from '../types'
import { http } from './client'

export interface LoginResult {
  token: string
  user: AuthUser
}

export const authApi = {
  login(username: string, password: string) {
    return http.post<LoginResult>('/auth/login', { username, password })
  },
  me() {
    return http.get<AuthUser>('/auth/me')
  },
  logout() {
    return http.post<{ success: boolean }>('/auth/logout')
  },
  changePassword(oldPassword: string, newPassword: string) {
    return http.post<{ success: boolean }>('/auth/change-password', { oldPassword, newPassword })
  },
}
