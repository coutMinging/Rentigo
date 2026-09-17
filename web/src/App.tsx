import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Spin } from 'antd'
import { LogoMark } from './components/Logo'
import BasicLayout from './layouts/BasicLayout'
import { useAuthStore } from './store/auth'
import LoginPage from './pages/login'
import DashboardPage from './pages/dashboard'
import FactoriesPage from './pages/property/FactoriesPage'
import ApartmentsPage from './pages/property/ApartmentsPage'
import TenantsPage from './pages/tenant'
import LeasesPage from './pages/lease'
import LeaseDetailPage from './pages/lease/LeaseDetailPage'
import BillsPage from './pages/finance/BillsPage'
import ReportsPage from './pages/finance/ReportsPage'
import PlaceholderPage from './pages/placeholder'
import NotificationsPage from './pages/notifications'
import SettingsPage from './pages/settings'

/** 首次进入时的启动画面，避免登录守卫与登录页来回闪烁 */
function BootScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <LogoMark size={44} />
        <Spin size="small" />
        <p className="text-[13px] text-[#86868B]">正在加载 Rentigo…</p>
      </div>
    </div>
  )
}

export default function App() {
  const bootstrapped = useAuthStore((state) => state.bootstrapped)
  const token = useAuthStore((state) => state.token)
  const bootstrap = useAuthStore((state) => state.bootstrap)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  if (!bootstrapped) return <BootScreen />

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/dashboard" replace /> : <LoginPage />} />

      {token ? (
        <Route element={<BasicLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/property/factories" element={<FactoriesPage />} />
          <Route path="/property/apartments" element={<ApartmentsPage />} />
          <Route path="/tenants" element={<TenantsPage />} />
          <Route path="/leases" element={<LeasesPage />} />
          <Route path="/leases/:id" element={<LeaseDetailPage />} />
          <Route path="/finance/bills" element={<BillsPage />} />
          <Route path="/finance/reports" element={<ReportsPage />} />
          <Route path="/viewings" element={<PlaceholderPage moduleKey="viewing" />} />
          <Route path="/work-orders" element={<PlaceholderPage moduleKey="workOrder" />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}

      <Route path="*" element={<Navigate to={token ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}
