import { http } from './client'

export interface UploadedFile {
  /** 原始文件名 */
  name: string
  /** 可直接用于 <img src> 的相对访问路径 */
  url: string
  /** 字节数 */
  size: number
}

/**
 * 通用文件上传。
 * category 需与后端 UPLOAD_CATEGORIES 一致（property / tenant / lease / workorder / misc），
 * 报修工单的故障图片使用 workorder。
 */
export const uploadApi = {
  files(category: string, files: File[]) {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    return http.post<{ files: UploadedFile[] }>(`/uploads/${category}`, form)
  },
}
