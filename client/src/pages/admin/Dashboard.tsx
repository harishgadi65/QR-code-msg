import { useEffect, useState } from 'react'
import { StatCard } from '../../components/StatCard'
import { apiGet } from '../../services/api'

interface Stats {
  totalQrCodes: number
  empty: number
  contentAdded: number
  disabled: number
  totalPhotos: number
  totalVideos: number
  totalBatches: number
  totalScans: number
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<Stats>('/admin/stats')
      .then(setStats)
      .catch(() => setError('Could not load dashboard stats.'))
  }, [])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {!stats && !error && <p className="text-slate-500">Loading...</p>}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Total QR Codes" value={stats.totalQrCodes} />
          <StatCard label="Empty" value={stats.empty} />
          <StatCard label="Content Added" value={stats.contentAdded} />
          <StatCard label="Disabled" value={stats.disabled} />
          <StatCard label="Total Batches" value={stats.totalBatches} />
          <StatCard label="Total Photos" value={stats.totalPhotos} />
          <StatCard label="Total Videos" value={stats.totalVideos} />
          <StatCard label="Total Scans" value={stats.totalScans} />
        </div>
      )}
    </div>
  )
}
