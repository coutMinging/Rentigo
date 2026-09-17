import axios, { type AxiosRequestConfig } from 'axios'
import type { ApiResult, PageResult } from '../types'
import { feedback } from './feedback'

export const TOKEN_KEY = 'farental_token'

/** 401 时由 store 注册的回调，避免 api 层直接依赖 router */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => {
    // 二进制流（Excel 导出）直接透传，不做业务解包
    if (response.config.responseType === 'blob') return response

    const body = response.data as ApiResult<unknown> | undefined
    if (body && typeof body.code === 'number' && body.code !== 0) {
      if (body.code === 401) {
        onUnauthorized?.()
      }
      // 静默标记：导出等场景由调用方自行提示
      if (!(response.config as { silent?: boolean }).silent) {
        feedback.error(body.message || '请求失败')
      }
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return response
  },
  (error) => {
    const status = error?.response?.status
    if (status === 401) {
      onUnauthorized?.()
      feedback.error('登录已失效，请重新登录')
      return Promise.reject(error)
    }

    const text =
      status === 403
        ? '没有操作权限'
        : status === 404
          ? '接口不存在'
          : status >= 500
            ? '服务器内部错误'
            : error?.message?.includes('timeout')
              ? '请求超时，请重试'
              : '网络异常，请检查后端服务是否启动'

    feedback.error(text)
    return Promise.reject(error)
  },
)

/** 继承 axios 配置，额外支持 silent 标记（失败不弹提示） */
interface RequestOptions extends AxiosRequestConfig {
  silent?: boolean
}

async function unwrap<T>(promise: Promise<{ data: ApiResult<T> }>): Promise<T> {
  const response = await promise
  return response.data.data
}

export const http = {
  get<T>(url: string, params?: Record<string, unknown>, options?: RequestOptions): Promise<T> {
    return unwrap<T>(client.get(url, { params, ...options }))
  },
  post<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return unwrap<T>(client.post(url, data, options))
  },
  put<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return unwrap<T>(client.put(url, data, options))
  },
  delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return unwrap<T>(client.delete(url, options))
  },
  /** 分页查询的语义化封装 */
  page<T>(
    url: string,
    params?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<PageResult<T>> {
    return unwrap<PageResult<T>>(client.get(url, { params, ...options }))
  },
}

/** 从 Content-Disposition 解析文件名，兼容 filename* 的 UTF-8 编码 */
function resolveFilename(disposition: string | undefined, fallback: string): string {
  if (!disposition) return fallback
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      return fallback
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain?.[1] ?? fallback
}

/** 导出类接口：拿到二进制流并触发浏览器下载 */
export async function download(
  url: string,
  params: Record<string, unknown> | undefined,
  fallbackName: string,
): Promise<void> {
  const response = await client.get(url, { params, responseType: 'blob' })

  // 后端返回的是 Excel 流；若意外返回 JSON，说明是业务错误
  const contentType = String(response.headers['content-type'] ?? '')
  if (contentType.includes('application/json')) {
    const text = await (response.data as Blob).text()
    const body = JSON.parse(text) as ApiResult<unknown>
    feedback.error(body.message || '导出失败')
    return
  }

  const filename = resolveFilename(response.headers['content-disposition'], fallbackName)
  const blobUrl = URL.createObjectURL(response.data as Blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(blobUrl)
  feedback.success('导出成功，请查看浏览器下载')
}

export { client as axiosInstance }
export type { AxiosRequestConfig }
