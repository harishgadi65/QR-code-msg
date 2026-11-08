import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { apiGet } from '../../services/api'
import { orderQrUrlFor, qrPngDataUrlForUrl } from '../../qr/qrDownload'
import type { OrderQrDoc, OrderSubmissionDoc } from '../../types/orderQr'

export function OrderQr() {
  const [qr, setQr] = useState<OrderQrDoc | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<OrderSubmissionDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet<OrderQrDoc>('/admin/order-qr')
      .then(async (doc) => {
        setQr(doc)
        setQrImage(await qrPngDataUrlForUrl(orderQrUrlFor(doc.publicToken)))
      })
      .catch(() => toast.error('Failed to load the order QR code.'))
    apiGet<{ items: OrderSubmissionDoc[] }>('/admin/order-qr/submissions')
      .then((res) => setSubmissions(res.items))
      .catch(() => toast.error('Failed to load submissions.'))
      .finally(() => setLoading(false))
  }, [])

  const downloadQr = () => {
    if (!qrImage || !qr) return
    const a = document.createElement('a')
    a.href = qrImage
    a.download = `${qr.qrId}.png`
    a.click()
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Online Order QR Codes</h1>

      <div className="mb-8 flex flex-col items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        {qrImage ? (
          <img src={qrImage} alt="Online order QR code" className="h-40 w-40 rounded-lg border border-slate-200" />
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-slate-200 text-xs text-slate-400">
            Loading…
          </div>
        )}
        <div>
          <p className="text-sm text-slate-600">
            One single QR code — print it on every chocolate box sold online. Anyone who scans it can sign in with
            Google and attach a photo, video, voice message, or note, protected by a phone number + PIN they choose.
            The receiver scans the same code and enters that phone number + PIN to view it.
          </p>
          {qr && (
            <p className="mt-2 break-all font-mono text-xs text-slate-400">{orderQrUrlFor(qr.publicToken)}</p>
          )}
          <button
            onClick={downloadQr}
            disabled={!qrImage}
            className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            Download QR Code
          </button>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Submissions</h2>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Uploader</th>
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Media</th>
              <th className="px-4 py-3">Phone Number</th>
              <th className="px-4 py-3">PIN</th>
              <th className="px-4 py-3">Saved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {submissions.map((s) => (
              <tr key={s.submissionId}>
                <td className="px-4 py-3">
                  <div>{s.uploaderName ?? '-'}</div>
                  <div className="text-xs text-slate-400">{s.uploaderEmail ?? '-'}</div>
                  {(s.fromName || s.toName) && (
                    <div className="mt-1 text-xs text-slate-400">
                      {s.fromName ?? '?'} → {s.toName ?? '?'}
                    </div>
                  )}
                </td>
                <td className="max-w-xs px-4 py-3 whitespace-pre-wrap text-slate-600">{s.message ?? '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 text-xs">
                    {s.photoUrl && (
                      <a href={s.photoUrl} target="_blank" rel="noreferrer" className="text-rose-600 underline">
                        Photo
                      </a>
                    )}
                    {s.videoUrl && (
                      <a href={s.videoUrl} target="_blank" rel="noreferrer" className="text-rose-600 underline">
                        Video
                      </a>
                    )}
                    {s.audioUrl && (
                      <a href={s.audioUrl} target="_blank" rel="noreferrer" className="text-rose-600 underline">
                        Audio
                      </a>
                    )}
                    {!s.photoUrl && !s.videoUrl && !s.audioUrl && <span className="text-slate-300">-</span>}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono">{s.phoneNumber}</td>
                <td className="px-4 py-3 font-mono tracking-widest">{s.pin}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(s.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!loading && submissions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
