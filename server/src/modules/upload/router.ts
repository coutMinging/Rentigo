import { Router } from 'express'
import { authRequired } from '../../middleware/auth'
import { UPLOAD_CATEGORIES, toPublicPath, upload } from '../../middleware/upload'
import { AppError, ok } from '../../utils/response'

/**
 * 通用上传路由。
 * 落盘策略、大小与类型限制全部由 middleware/upload.ts 的 multer 实例控制，
 * 这里只负责校验业务分类并把 multer 的错误转成统一业务异常。
 */
export const uploadRouter = Router()
uploadRouter.use(authRequired)

/** 单次最多 10 个文件，供房源图片、租客证件、报修图等场景共用 */
const receiveFiles = upload.array('files', 10)

uploadRouter.post('/:category', (req, res, next) => {
  const category = String(req.params.category ?? '').trim()
  if (!(UPLOAD_CATEGORIES as readonly string[]).includes(category)) {
    next(AppError.badRequest(`不支持的上传分类：${category || '（空）'}`))
    return
  }

  receiveFiles(req, res, (err: unknown) => {
    if (err) {
      // multer 抛出的 MulterError / 类型错误不是 AppError，
      // 不转换的话会被全局错误处理当成服务器内部错误（500）
      console.error('[upload] 上传失败:', err)
      next(AppError.badRequest(err instanceof Error ? err.message : '文件上传失败'))
      return
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    if (files.length === 0) {
      next(AppError.badRequest('请选择要上传的文件'))
      return
    }

    ok(res, {
      files: files.map((file) => ({
        name: file.originalname,
        url: toPublicPath(category, file.filename),
        size: file.size,
      })),
    })
  })
})
