import { useState } from 'react'
import { apiPost, ApiError } from '../../services/api'
import type { MemoryContent } from './PinGate'

// Lets whoever received the chocolate find their specific memory among everyone
// else's — the sender tells them the phone number + PIN out of band (written on
// the box, texted, etc. — see OrderMemoryForm.tsx's preview step).
export function OrderMemoryLookup({ token, onFound }: { token: string; onFound: (content: MemoryContent) => void }) {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!/^\d{7,15}$/.test(phoneNumber)) {
      setError('Please enter a valid phone number.')
      return
    }
    if (pin.length !== 4) {
      setError('Please enter the 4-digit PIN.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await apiPost<MemoryContent>(`/order-qr/${token}/lookup`, { phoneNumber, pin })
      onFound(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vintage-page flex flex-col items-center justify-center px-6 text-center">
      <div className="vintage-card w-full max-w-sm p-8">
        <div className="mb-3 text-5xl">🎁</div>
        <h1 className="vintage-heading mb-1 text-xl">Find Your Memory</h1>
        <p className="vintage-body mb-5 text-sm text-[#6b5b3d]">
          Enter the phone number and 4-digit PIN the sender gave you.
        </p>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          value={phoneNumber}
          onChange={(e) => {
            setError(null)
            setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 15))
          }}
          placeholder="Phone number"
          className="vintage-input mb-3 w-full px-4 py-3 text-center"
        />
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
          disabled={busy || phoneNumber.length < 7 || pin.length !== 4}
          className="vintage-btn w-full rounded-full py-3 text-sm disabled:opacity-60"
        >
          {busy ? 'Looking…' : 'View Memory'}
        </button>
      </div>
    </div>
  )
}
