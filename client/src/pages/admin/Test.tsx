import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { apiPost } from '../../services/api'

const TEST_QR_ID = 'TEST-QR-0001'

export function Test() {
  const [ready, setReady] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)

  useEffect(() => {
    apiPost('/admin/test/ensure')
      .then(() => setReady(true))
      .catch(() => toast.error('Could not prepare the test QR.'))
  }, [])

  const onReset = async () => {
    try {
      await apiPost('/admin/test/reset')
      toast.success('Test QR reset to empty')
      setIframeKey((k) => k + 1)
    } catch {
      toast.error('Failed to reset test QR.')
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Test / Preview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Try the full customer experience on <span className="font-mono">{TEST_QR_ID}</span> without printing or
            scanning a real QR code.
          </p>
        </div>
        <button onClick={() => void onReset()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Reset test QR
        </button>
      </div>

      {ready && (
        <div className="mx-auto max-w-sm overflow-hidden rounded-3xl border border-slate-300 bg-white shadow-sm">
          <iframe key={iframeKey} src={`#/m/${TEST_QR_ID}`} className="h-[720px] w-full" title="Customer preview" />
        </div>
      )}
    </div>
  )
}
