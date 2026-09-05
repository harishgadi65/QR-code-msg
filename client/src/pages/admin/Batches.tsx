import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { apiGet } from '../../services/api'
import type { BatchDoc } from '../../types/qr'

export function Batches() {
  const [batches, setBatches] = useState<BatchDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet<{ items: BatchDoc[] }>('/admin/batches')
      .then((res) => setBatches(res.items))
      .catch(() => toast.error('Failed to load batches.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Batches</h1>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Batch ID</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Range</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map((b) => (
              <tr key={b.batchId}>
                <td className="px-4 py-3 font-mono">{b.batchId}</td>
                <td className="px-4 py-3">{b.label ?? '-'}</td>
                <td className="px-4 py-3">{b.quantity}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {b.startQrId} → {b.endQrId}
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(b.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {!loading && batches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No batches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
