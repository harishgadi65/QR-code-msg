import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { apiDelete, apiGet, apiPost, ApiError } from '../../services/api'
import type { QrDoc } from '../../types/qr'
import { mediaTypeOf } from '../../types/qr'

interface ListResponse {
  items: QrDoc[]
  nextCursor: string | null
}

export function Trash() {
  const [items, setItems] = useState<QrDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet<ListResponse>('/admin/qr?status=archived&limit=200')
      setItems(res.items)
    } catch {
      toast.error('Failed to load Trash.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onRestore = (qrId: string) => {
    setBusyId(qrId)
    void (async () => {
      try {
        await apiPost(`/admin/qr/${qrId}/restore`)
        toast.success(`${qrId} restored`)
        await load()
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to restore QR code.')
      } finally {
        setBusyId(null)
      }
    })()
  }

  const onDeletePermanently = (qrId: string) => {
    if (!confirm(`Permanently delete ${qrId}? This removes its photo/video from Google Drive too and cannot be undone.`)) return
    setBusyId(qrId)
    void (async () => {
      try {
        await apiDelete(`/admin/qr/${qrId}/content`)
        toast.success(`${qrId} permanently deleted`)
        await load()
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to delete QR code.')
      } finally {
        setBusyId(null)
      }
    })()
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Trash</h1>
      <p className="mb-6 text-sm text-slate-500">
        QR codes here show as unavailable to customers. Restore to bring them back, or delete permanently to also
        remove their photo/video from Google Drive and free the QR code for reuse.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">QR ID</th>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">Media</th>
              <th className="px-4 py-3">Trashed</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.qrId}>
                <td className="px-4 py-3 font-mono">{item.qrId}</td>
                <td className="px-4 py-3 text-slate-500">{item.batchId ?? '-'}</td>
                <td className="px-4 py-3">{item.fromName ?? '-'}</td>
                <td className="px-4 py-3">{item.toName ?? '-'}</td>
                <td className="px-4 py-3 text-slate-500">{mediaTypeOf(item)}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(item.updatedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onRestore(item.qrId)}
                      disabled={busyId === item.qrId}
                      className="text-emerald-600 hover:underline disabled:opacity-40"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => onDeletePermanently(item.qrId)}
                      disabled={busyId === item.qrId}
                      className="text-red-600 hover:underline disabled:opacity-40"
                    >
                      Delete Permanently
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Trash is empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
