import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { apiGet, apiPost, ApiError } from '../../services/api'
import type { QrDoc, QrStatus } from '../../types/qr'
import { mediaTypeOf } from '../../types/qr'
import { downloadQrPng } from '../../qr/qrDownload'
import { QrDetailModal } from '../../components/admin/QrDetailModal'

interface ListResponse {
  items: QrDoc[]
  nextCursor: string | null
}

const STATUS_OPTIONS: { value: QrStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'empty', label: 'Empty' },
  { value: 'content_added', label: 'Content Added' },
  { value: 'disabled', label: 'Disabled' },
]

export function QrBank() {
  const [items, setItems] = useState<QrDoc[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [prevCursors, setPrevCursors] = useState<(string | null)[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<QrStatus | ''>('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<QrDoc | null>(null)

  const load = useCallback(async (cur: string | null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      if (cur) params.set('cursor', cur)
      params.set('limit', '25')

      const res = await apiGet<ListResponse>(`/admin/qr?${params.toString()}`)
      // Trashed QR codes live in the Trash page, not the main bank.
      setItems(status === 'archived' ? res.items : res.items.filter((i) => i.status !== 'archived'))
      setCursor(res.nextCursor)
    } catch {
      toast.error('Failed to load QR codes.')
    } finally {
      setLoading(false)
    }
  }, [search, status])

  useEffect(() => {
    setPrevCursors([])
    void load(null)
  }, [load])

  const onNext = () => {
    if (!cursor) return
    setPrevCursors((p) => [...p, cursor])
    void load(cursor)
  }

  const onPrev = () => {
    const next = [...prevCursors]
    next.pop()
    setPrevCursors(next)
    void load(next[next.length - 1] ?? null)
  }

  const onDelete = (qrId: string) => {
    if (!confirm(`Move ${qrId} to Trash? The QR code will show as unavailable until restored.`)) return
    void (async () => {
      try {
        await apiPost(`/admin/qr/${qrId}/trash`)
        toast.success('Moved to Trash')
        void load(prevCursors[prevCursors.length - 1] ?? null)
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to delete QR code.')
      }
    })()
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">QR Bank</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search QR ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as QrStatus | '')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">QR ID</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">Media</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.qrId}>
                <td className="px-4 py-3 font-mono">{item.qrId}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3 text-slate-500">{item.batchId ?? '-'}</td>
                <td className="px-4 py-3">{item.fromName ?? '-'}</td>
                <td className="px-4 py-3">{item.toName ?? '-'}</td>
                <td className="px-4 py-3 text-slate-500">{mediaTypeOf(item)}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(item.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setSelected(item)} className="text-rose-600 hover:underline">
                      View
                    </button>
                    <button onClick={() => void downloadQrPng(item.qrId, item.publicToken ?? item.qrId)} className="text-slate-500 hover:underline">
                      Download
                    </button>
                    <button onClick={() => onDelete(item.qrId)} className="text-red-600 hover:underline">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  No QR codes found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onPrev}
          disabled={prevCursors.length === 0}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={onNext}
          disabled={!cursor}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>

      {selected && (
        <QrDetailModal
          qr={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null)
            void load(prevCursors[prevCursors.length - 1] ?? null)
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: QrStatus }) {
  const styles: Record<QrStatus, string> = {
    empty: 'bg-slate-100 text-slate-600',
    pending_upload: 'bg-amber-100 text-amber-700',
    content_added: 'bg-emerald-100 text-emerald-700',
    disabled: 'bg-red-100 text-red-700',
    archived: 'bg-slate-200 text-slate-500',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{status}</span>
}
