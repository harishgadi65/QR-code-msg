import { useState } from 'react'
import { apiPost, ApiError } from '../../services/api'

export interface MemoryContent {
  status: 'content_added'
  fromName: string | null
  toName: string | null
  message: string | null
  photoUrl: string | null
  photoDriveId: string | null
  videoUrl: string | null
  videoDriveId: string | null
  audioUrl: string | null
  audioDriveId: string | null
}

type VerifyPinResponse = MemoryContent | { status: 'expired' | 'scan_limit_reached' | 'not_found' }

// Shown instead of the memory when the sender protected it with a 4-digit PIN (see
// routes/customerQr.ts's verify-pin). A wrong PIN doesn't reveal whether the QR itself
// is valid — same generic error either way — and repeated wrong guesses eventually
// lock out from the server side, not just this component.
export function PinGate({ qrId, onUnlocked }: { qrId: string; onUnlocked: (content: MemoryContent) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (pin.length !== 4) {
      setError('Please enter all 4 digits.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await apiPost<VerifyPinResponse>(`/qr/${qrId}/verify-pin`, { pin })
      if (res.status === 'content_added') {
        onUnlocked(res)
        return
      }
      if (res.status === 'expired') {
        setError('This memory has expired.')
      } else if (res.status === 'scan_limit_reached') {
        setError('The view limit for this memory has been reached.')
      } else {
        setError('This QR code is not registered.')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vintage-page flex flex-col items-center justify-center px-6 text-center">
      <div className="vintage-card w-full max-w-sm p-8">
        <div className="mb-3 text-5xl">🔒</div>
        <h1 className="vintage-heading mb-1 text-xl">Enter PIN</h1>
        <p className="vintage-body mb-5 text-sm text-[#6b5b3d]">This memory is protected. Enter the 4-digit PIN to view it.</p>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            setError(null)
            setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          className="vintage-input mb-3 w-full px-4 py-3 text-center text-2xl tracking-[0.5em]"
          placeholder="••••"
        />
        {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
        <button
          onClick={() => void submit()}
          disabled={busy || pin.length !== 4}
          className="vintage-btn w-full rounded-full py-3 text-sm disabled:opacity-60"
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </div>
    </div>
  )
}
