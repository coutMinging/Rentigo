import type { MessageInstance } from 'antd/es/message/interface'
import type { ModalStaticFunctions } from 'antd/es/modal/confirm'
import type { NotificationInstance } from 'antd/es/notification/interface'

/**
 * antd 的静态方法（message.error 等）拿不到 ConfigProvider 的主题，
 * 会退化成默认样式且控制台告警。
 * 这里由 <AntdBridge /> 在运行时注入 App.useApp() 得到的实例，
 * 让非组件代码（axios 拦截器等）也能用到带主题的反馈组件。
 */
interface FeedbackHolder {
  message: MessageInstance
  notification: NotificationInstance
  modal: Omit<ModalStaticFunctions, 'warn'>
}

let holder: FeedbackHolder | null = null

export function setFeedback(next: FeedbackHolder): void {
  holder = next
}

export const feedback = {
  success(content: string) {
    holder?.message.success(content)
  },
  error(content: string) {
    holder?.message.error(content)
  },
  warning(content: string) {
    holder?.message.warning(content)
  },
  info(content: string) {
    holder?.message.info(content)
  },
  /** 二次确认，返回用户是否确认 */
  async confirm(title: string, content: string): Promise<boolean> {
    if (!holder) return window.confirm(`${title}\n\n${content}`)
    return new Promise((resolve) => {
      holder!.modal.confirm({
        title,
        content,
        okText: '确定',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
  },
}
