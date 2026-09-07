import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { apiDelete, apiPatch, apiPost, ApiError } from '../../services/api'
import { uploadFileToDrive } from '../../services/driveUpload'
import type { QrDoc } from '../../types/qr'
import { downloadQrPng, qrPngDataUrl, qrUrlFor } from '../../qr/qrDownload'

export function QrDetailModal({
  qr,
  onClose,
  onChanged,
}: {
  qr: QrDoc
  onClose: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [fromName, setFromName] = useState(qr.fromName ?? '')
  const [toName, setToName] = useState(qr.toName ?? '')
  const [message, setMessage] = useState(qr.message ?? '')
  const [qrImage, setQrImage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void qrPngDataUrl(qr.qrId).then((url) => {
      if (!cancelled) setQrImage(url)
    })
    return () => {
      cancelled = true
    }
  }, [qr.qrId])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const onDisable = () =>
    run(async () => {
      await apiPost(`/admin/qr/${qr.qrId}/disable`)
      toast.success('QR disabled')
    })

  const onEnable = () =>
    run(async () => {
      await apiPost(`/admin/qr/${qr.qrId}/enable`)
      toast.success('QR enabled')
    })

  const onDeleteContent = () => {
    if (!confirm(`Delete the memory attached to ${qr.qrId}?`)) return
    void run(async () => {
      await apiDelete(`/admin/qr/${qr.qrId}/content`)
      toast.success('Content deleted')
    })
  }

  const onSaveMessage = () =>
    run(async () => {
      await apiPatch(`/admin/qr/${qr.qrId}/message`, { fromName, toName, message })
      toast.success('Message updated')
    })

  const onReplace = (kind: 'photo' | 'video' | 'audio', file: File) => {
    void run(async () => {
      const init = await apiPost<{ accessToken: string; folderId: string }>(`/admin/qr/${qr.qrId}/media-upload-init`, { kind })
      const driveId = await uploadFileToDrive(init.accessToken, init.folderId, file, file.name)
      await apiPost(`/admin/qr/${qr.qrId}/media-finalize`, { kind, driveId })
      toast.success(`${kind === 'photo' ? 'Photo' : 'Video'} replaced`)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-lg font-semibold">{qr.qrId}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-4">
          {qrImage ? (
            <img src={qrImage} alt={`QR code for ${qr.qrId}`} className="h-40 w-40" />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center text-xs text-slate-400">Generating…</div>
          )}
          <a href={qrUrlFor(qr.qrId)} target="_blank" rel="noreferrer" className="mt-2 break-all text-center text-xs text-slate-500 hover:underline">
            {qrUrlFor(qr.qrId)}
          </a>
        </div>

        <div className="mb-4 flex gap-2">
          <button onClick={() => void downloadQrPng(qr.qrId)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            Download QR
          </button>
          {qr.status === 'disabled' ? (
            <button onClick={onEnable} disabled={busy} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-700">
              Enable
            </button>
          ) : (
            <button onClick={onDisable} disabled={busy} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700">
              Disable
            </button>
          )}
        </div>

        {qr.photoUrl && <img src={qr.photoUrl} alt="Memory photo" className="mb-3 max-h-48 w-full rounded-lg object-cover" />}
        {qr.videoUrl && (
          <iframe src={qr.videoUrl} className="mb-3 aspect-video w-full rounded-lg" allow="autoplay" allowFullScreen />
        )}
        {qr.audioUrl && <audio src={qr.audioUrl} controls className="mb-3 w-full" />}

        {qr.uploaderEmail && (
          <p className="mb-3 text-xs text-slate-400">
            Uploaded by {qr.uploaderName ? `${qr.uploaderName} (${qr.uploaderEmail})` : qr.uploaderEmail}
          </p>
        )}

        <div className="mb-4 space-y-2">
          <label className="block text-xs font-medium text-slate-500">From</label>
          <input value={fromName} onChange={(e) => setFromName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <label className="block text-xs font-medium text-slate-500">To</label>
          <input value={toName} onChange={(e) => setToName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <label className="block text-xs font-medium text-slate-500">Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <button onClick={() => void onSaveMessage()} disabled={busy} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white">
            Save message
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm">
            Replace Photo
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && onReplace('photo', e.target.files[0])} />
          </label>
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm">
            Replace Video
            <input type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => e.target.files?.[0] && onReplace('video', e.target.files[0])} />
          </label>
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm">
            Replace Voice
            <input type="file" accept="audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/x-m4a" hidden onChange={(e) => e.target.files?.[0] && onReplace('audio', e.target.files[0])} />
          </label>
        </div>

        <button onClick={onDeleteContent} disabled={busy} className="w-full rounded-lg border border-red-300 py-1.5 text-sm text-red-700 hover:bg-red-50">
          Delete Content
        </button>
      </div>
    </div>
  )
}
