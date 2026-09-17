import { App } from 'antd'
import { setFeedback } from '../api/feedback'

/**
 * 把 antd 的 App 上下文反馈实例注入到非组件模块（axios 拦截器等）。
 * 放在 ConfigProvider 内层，因此能继承主题与中文语言包。
 */
export default function AntdBridge() {
  const { message, notification, modal } = App.useApp()
  setFeedback({ message, notification, modal })
  return null
}
