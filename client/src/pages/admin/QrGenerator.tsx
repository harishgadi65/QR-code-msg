import { useState } from 'react'
import toast from 'react-hot-toast'
import { apiPost } from '../../services/api'
import { downloadQrSheetPdf } from '../../qr/qrDownload'

interface GenerateResult {
  batchId: string
  startQrId: string
  endQrId: string
  quantity: number
}

function expandRange(start: string, end: string): string[] {
  const prefix = start.replace(/\d+$/, '')
  const digits = start.length - prefix.length
  const startN = Number(start.slice(prefix.length))
  const endN = Number(end.slice(prefix.length))
  const ids: string[] = []
  for (let n = startN; n <= endN; n++) ids.push(`${prefix}${String(n).padStart(digits, '0')}`)
  return ids
}

export function QrGenerator() {
  const [quantity, setQuantity] = useState(10)
  const [batchLabel, setBatchLabel] = useState('')
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onGenerate = async () => {
    setSubmitting(true)
    setResult(null)
    try {
      const res = await apiPost<GenerateResult>('/admin/qr/generate', { quantity, batchLabel: batchLabel || undefined })
      setResult(res)
      toast.success(`Generated ${res.quantity} QR codes (${res.startQrId} → ${res.endQrId})`)
    } catch {
      toast.error('Failed to generate QR codes. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const onDownloadSheet = async () => {
    if (!result) return
    const ids = expandRange(result.startQrId, result.endQrId)
    if (ids.length > 2000) {
      toast.error('Batches over 2,000 QR codes are too large to render as one PDF in the browser. Download from the QR Bank in smaller chunks instead.')
      return
    }
    await downloadQrSheetPdf(ids, batchLabel || undefined)
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Create QR Codes</h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="mb-1 block text-sm font-medium text-slate-700">Quantity</label>
        <input
          type="number"
          min={1}
          max={100000}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">Batch label (optional)</label>
        <input
          type="text"
          value={batchLabel}
          onChange={(e) => setBatchLabel(e.target.value)}
          placeholder="e.g. Diwali Chocolate Boxes"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
        />

        <button
          onClick={() => void onGenerate()}
          disabled={submitting || quantity < 1}
          className="w-full rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {submitting ? 'Generating...' : 'Generate QR Codes'}
        </button>
      </div>

      {result && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <p className="font-medium text-emerald-800">
            Created {result.quantity} QR codes: {result.startQrId} → {result.endQrId}
          </p>
          <p className="text-sm text-emerald-700">Batch: {result.batchId}</p>
          <button
            onClick={() => void onDownloadSheet()}
            className="mt-3 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            Download printable PDF sheet
          </button>
        </div>
      )}
    </div>
  )
}
