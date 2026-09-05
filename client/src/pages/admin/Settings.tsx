import { useAuth } from '../../hooks/useAuth'

export function Settings() {
  const { user } = useAuth()

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 font-medium text-slate-700">Account</h2>
        <p className="text-sm text-slate-500">Signed in as {user?.email}</p>
        <p className="mt-1 text-sm text-slate-500">
          To change your password, use the Firebase Console (Authentication → Users), or run the{' '}
          <code className="rounded bg-slate-100 px-1">functions/scripts/createAdmin.ts</code> script again.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 font-medium text-slate-700">Environment</h2>
        <p className="text-sm text-slate-500">
          App base URL, Google Drive credentials, and other secrets are configured server-side via environment
          variables. See <code className="rounded bg-slate-100 px-1">.env.example</code> and the project README.
        </p>
      </div>
    </div>
  )
}
