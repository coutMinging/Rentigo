import { useEffect, useState } from 'react'
import { Button, Modal, Segmented } from 'antd'
import { Printer } from 'lucide-react'
import { leaseApi } from '../../api/lease'
import { feedback } from '../../api/feedback'
import type { PropertyType } from '../../types'

interface Props {
  open: boolean
  leaseId: number
  leaseNo: string
  propertyType: PropertyType
  hasDecoration: boolean
  onClose: () => void
}

/**
 * 合同预览。
 * 合同正文由服务端渲染成 HTML，这里用 iframe 承载并由浏览器打印导出 PDF，
 * 中文渲染天然正确，也满足需求里的「线下打印」要求。
 */
export default function ContractModal({
  open,
  leaseId,
  leaseNo,
  propertyType,
  hasDecoration,
  onClose,
}: Props) {
  const [kind, setKind] = useState<string>('')
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind(propertyType)
  }, [open, propertyType])

  useEffect(() => {
    if (!open || !kind) return
    setLoading(true)
    leaseApi
      .contract(leaseId, kind)
      .then((res) => setHtml(res.html))
      .catch((err) => console.error('[contract] 加载失败:', err))
      .finally(() => setLoading(false))
  }, [open, kind, leaseId])

  const handlePrint = () => {
    const frame = document.getElementById('contract-frame') as HTMLIFrameElement | null
    if (!frame?.contentWindow) {
      feedback.warning('预览尚未就绪，请稍后重试')
      return
    }
    frame.contentWindow.focus()
    frame.contentWindow.print()
  }

  return (
    <Modal
      title={`合同预览 · ${leaseNo}`}
      open={open}
      onCancel={onClose}
      width={900}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[#86868B]">
            点击打印后在系统打印窗口选择「另存为 PDF」即可导出文件
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>关闭</Button>
            <Button type="primary" icon={<Printer size={15} />} onClick={handlePrint} disabled={!html}>
              打印 / 导出 PDF
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-4">
        <Segmented
          value={kind}
          onChange={(v) => setKind(v as string)}
          options={[
            {
              value: propertyType,
              label: propertyType === 'factory' ? '厂房租赁合同' : '公寓租赁合同',
            },
            ...(hasDecoration
              ? [{ value: 'decoration', label: '装修费抵扣租金补充协议' }]
              : []),
          ]}
        />
      </div>

      <div className="rounded-xl border border-black/[0.06] bg-white">
        {loading && !html ? (
          <div className="flex h-[520px] items-center justify-center text-[13px] text-[#AEAEB2]">
            合同生成中…
          </div>
        ) : (
          <iframe
            id="contract-frame"
            title="合同预览"
            srcDoc={html}
            className="h-[520px] w-full rounded-xl"
          />
        )}
      </div>
    </Modal>
  )
}
