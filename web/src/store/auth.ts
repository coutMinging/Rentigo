import { create } from 'zustand'
import { authApi } from '../api/auth'
import { TOKEN_KEY, setUnauthorizedHandler } from '../api/client'
import type { AuthUser } from '../types'

interface AuthState {
  token: string | null
  user: AuthUser | null
  /** 首次进入时用已存 Token 换用户信息，避免刷新丢失登录态 */
  bootstrapped: boolean
  logging: boolean
  login: (username: string, password: string) => Promise<void>
  logout: (silent?: boolean) => Promise<void>
  bootstrap: () => Promise<void>
  /** 判断当前用户是否具备某模块某动作的权限 */
  can: (module: string, action: string) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  bootstrapped: false,
  logging: false,

  async login(username, password) {
    set({ logging: true })
    try {
      const result = await authApi.login(username, password)
      localStorage.setItem(TOKEN_KEY, result.token)
      set({ token: result.token, user: result.user, bootstrapped: true })
    } finally {
      set({ logging: false })
    }
  },

  async logout(silent = false) {
    if (!silent) {
      // 退出失败不影响本地清理
      authApi.logout().catch((err) => console.error('[auth] 退出接口异常:', err))
    }
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, user: null })
  },

  async bootstrap() {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      set({ bootstrapped: true, user: null, token: null })
      return
    }

    try {
      const user = await authApi.me()
      set({ user, token, bootstrapped: true })
    } catch (err) {
      console.error('[auth] 恢复登录态失败:', err)
      localStorage.removeItem(TOKEN_KEY)
      set({ user: null, token: null, bootstrapped: true })
    }
  },

  can(module, action) {
    const user = get().user
    if (!user) return false
    if (user.roleCode === 'admin') return true
    const allowed = user.permissions?.[module] ?? []
    return allowed.includes('*') || allowed.includes(action)
  },
}))

/** 令牌失效时由 axios 拦截器回调，清空本地登录态 */
setUnauthorizedHandler(() => {
  localStorage.removeItem(TOKEN_KEY)
  const state = useAuthStore.getState()
  if (state.token || state.user) {
    useAuthStore.setState({ token: null, user: null })
  }
})
