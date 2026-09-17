import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { config } from '../config'

/** 允许上传的业务目录：房源图片、资质附件、租客证件、协议附件、报修图 */
export const UPLOAD_CATEGORIES = ['property', 'tenant', 'lease', 'workorder', 'misc'] as const
export type UploadCategory = (typeof UPLOAD_CATEGORIES)[number]

const ALLOWED_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
])

function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const raw = String(req.params.category ?? req.query.category ?? 'misc')
    const category = (UPLOAD_CATEGORIES as readonly string[]).includes(raw)
      ? (raw as UploadCategory)
      : 'misc'
    cb(null, ensureDir(path.join(config.uploadDir, category)))
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase()
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${stamp}${ext}`)
  },
})

export const upload = multer({
  storage,
  limits: { fileSize: config.uploadMaxSize, files: 10 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      cb(new Error(`不支持的文件类型：${ext}，仅允许图片、PDF 与 Office 文档`))
      return
    }
    cb(null, true)
  },
})

/** 把上传结果转成可直接存库的相对访问路径 */
export function toPublicPath(category: string, filename: string): string {
  return `/uploads/${category}/${filename}`
}
