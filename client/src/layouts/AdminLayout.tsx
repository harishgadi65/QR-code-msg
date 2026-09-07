import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/qrs/create', label: 'QR Generator' },
  { to: '/admin/qrs', label: 'QR Bank' },
  { to: '/admin/trash', label: 'Trash' },
  { to: '/admin/batches', label: 'Batches' },
  { to: '/admin/test', label: 'Test / Preview' },
  { to: '/admin/settings', label: 'Settings' },
]

export function AdminLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="px-6 py-5 text-lg font-semibold">QR Memories</div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-rose-50 text-rose-600' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4 text-sm">
          <div className="truncate text-slate-500">{user?.email}</div>
          <button
            onClick={() => void logout()}
            className="mt-2 w-full rounded-lg border border-slate-200 py-1.5 text-slate-600 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
