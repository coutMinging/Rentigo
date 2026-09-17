import type {
  Bill,
  BillItem,
  DashboardData,
  DepositRecord,
  PageResult,
  Payment,
  ReportData,
} from '../types'
import { download, http } from './client'

export interface BillListResult extends PageResult<Bill> {
  totals: { payable: number; paid: number; deduction: number; outstanding: number }
}

export interface PaymentListResult extends PageResult<Payment> {
  total_amount: number
}

export interface DepositListResult {
  list: DepositRecord[]
  summary: { collected: number; refunded: number; deducted: number; holding: number }
}

export const billApi = {
  list(params: Record<string, unknown>) {
    return http.get<BillListResult>('/bills', params)
  },
  arrears() {
    return http.get<{ list: Bill[]; total: number; total_owed: number }>('/bills/arrears')
  },
  detail(id: number) {
    return http.get<{ bill: Bill; items: BillItem[]; payments: Payment[] }>(`/bills/${id}`)
  },
  addItem(id: number, data: { type: string; name?: string; amount: number; remark?: string }) {
    return http.post<{ success: boolean; payable: number }>(`/bills/${id}/items`, data)
  },
  removeItem(itemId: number) {
    return http.delete<{ success: boolean; payable: number }>(`/bills/items/${itemId}`)
  },
  addPayment(
    id: number,
    data: { amount: number; pay_date: string; method: string; remark?: string },
  ) {
    return http.post<{ success: boolean; paid_amount: number; status: string; outstanding: number }>(
      `/bills/${id}/payments`,
      data,
    )
  },
  removePayment(paymentId: number) {
    return http.delete<{ success: boolean }>(`/bills/payments/${paymentId}`)
  },
  payments(params: Record<string, unknown>) {
    return http.get<PaymentListResult>('/bills/payments', params)
  },
  deposits() {
    return http.get<DepositListResult>('/bills/deposits')
  },
  reports(params: Record<string, unknown>) {
    return http.get<ReportData>('/bills/reports', params)
  },
  export(params: Record<string, unknown>) {
    return download('/bills/export', params, '账单台账.xlsx')
  },
  exportReport(params: Record<string, unknown>) {
    return download('/bills/reports/export', params, '财务报表.xlsx')
  },
}

export const dashboardApi = {
  overview() {
    return http.get<DashboardData>('/dashboard')
  },
}
