import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin } from './components/RequireAdmin'
import { AdminLayout } from './layouts/AdminLayout'
import { Login } from './pages/admin/Login'
import { Dashboard } from './pages/admin/Dashboard'
import { QrGenerator } from './pages/admin/QrGenerator'
import { QrBank } from './pages/admin/QrBank'
import { Trash } from './pages/admin/Trash'
import { Batches } from './pages/admin/Batches'
import { Test } from './pages/admin/Test'
import { Settings } from './pages/admin/Settings'
import { OrderQr } from './pages/admin/OrderQr'
import { MemoryPage } from './pages/customer/MemoryPage'
import { OrderQrPage } from './pages/customer/OrderQrPage'

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      Page not found.
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="qrs" element={<QrBank />} />
        <Route path="trash" element={<Trash />} />
        <Route path="qrs/create" element={<QrGenerator />} />
        <Route path="batches" element={<Batches />} />
        <Route path="test" element={<Test />} />
        <Route path="settings" element={<Settings />} />
        <Route path="order-qr" element={<OrderQr />} />
      </Route>
      <Route path="/m/:qrId" element={<MemoryPage />} />
      <Route path="/order/:token" element={<OrderQrPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
