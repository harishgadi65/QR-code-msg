import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet } from '../../services/api'
import { GoogleSignInGate } from '../../components/customer/GoogleSignInGate'
import { OrderMemoryForm } from '../../components/customer/OrderMemoryForm'
import { OrderMemoryLookup } from '../../components/customer/OrderMemoryLookup'
import { MemoryView } from '../../components/customer/MemoryView'
import type { MemoryContent } from '../../components/customer/PinGate'

function CenteredMessage({ emoji, title, subtitle }: { emoji: string; title: string; subtitle: string }) {
  return (
    <div className="vintage-page flex flex-col items-center justify-center px-6 text-center">
      <div className="vintage-card w-full max-w-sm p-8">
        <div className="mb-3 text-5xl">{emoji}</div>
        <h1 className="vintage-heading mb-1 text-xl">{title}</h1>
        {subtitle && <p className="vintage-body text-sm text-[#6b5b3d]">{subtitle}</p>}
      </div>
    </div>
  )
}

type Screen = 'choice' | 'add' | 'lookup' | 'saved' | 'view'

// signInWithRedirect takes the whole browser to accounts.google.com and back —
// a full page reload, not a client-side navigation, which would otherwise wipe
// the "I'm Sending" choice below right back to the welcome screen the instant
// Google redirects back. Session-storage (not React state) survives that reload.
function screenStorageKey(token: string) {
  return `order-qr-screen:${token}`
}
function readStoredScreen(token: string): Screen {
  try {
    const stored = sessionStorage.getItem(screenStorageKey(token))
    if (stored === 'add' || stored === 'lookup') return stored
  } catch {
    // ignore: private browsing or storage blocked
  }
  return 'choice'
}

// Landing page for the one shared "online order" QR, printed on every chocolate
// box sold online (see pages/admin/OrderQr.tsx) — unlike /m/:qrId, which already
// knows what a scan means from that one QR's status, this same link is scanned
// by many different people for different reasons, so it has to ask first.
export function OrderQrPage() {
  const { token } = useParams<{ token: string }>()
  const [valid, setValid] = useState<boolean | null>(null)
  const [screen, setScreenState] = useState<Screen>(() => readStoredScreen(token ?? ''))
  const [savedCreds, setSavedCreds] = useState<{ phoneNumber: string; pin: string } | null>(null)
  const [viewedContent, setViewedContent] = useState<MemoryContent | null>(null)

  const setScreen = (next: Screen) => {
    setScreenState(next)
    try {
      if (token) sessionStorage.setItem(screenStorageKey(token), next)
    } catch {
      // ignore: private browsing or storage blocked
    }
  }

  useEffect(() => {
    if (!token) return
    apiGet<{ ok: boolean }>(`/order-qr/${token}/check`)
      .then((res) => setValid(res.ok))
      .catch(() => setValid(false))
  }, [token])

  if (!token || valid === false) {
    return <CenteredMessage emoji="🔍" title="QR Code Not Found" subtitle="This QR code is not registered." />
  }
  if (valid === null) {
    return <CenteredMessage emoji="⏳" title="Loading..." subtitle="" />
  }

  if (screen === 'saved' && savedCreds) {
    return (
      <div className="vintage-page flex flex-col items-center justify-center px-6 py-10 text-center">
        <div className="vintage-card w-full max-w-sm p-8">
          <div className="mb-4 text-5xl">🎁</div>
          <h1 className="vintage-heading mb-2 text-2xl">Memory Saved</h1>
          <p className="vintage-body mb-4 text-sm text-[#6b5b3d]">
            Give the receiver this phone number and PIN — they'll need both to view it when they scan this same QR code.
          </p>
          <div className="mb-6 rounded-2xl border border-[#e3c691] bg-[#fffaf0] p-4">
            <p className="vintage-label text-xs uppercase">Phone Number</p>
            <p className="vintage-body mb-2 text-lg font-semibold">{savedCreds.phoneNumber}</p>
            <p className="vintage-label text-xs uppercase">PIN</p>
            <p className="vintage-body text-2xl font-semibold tracking-[0.3em]">{savedCreds.pin}</p>
          </div>
          <button
            onClick={() => {
              setSavedCreds(null)
              setScreen('choice')
            }}
            className="vintage-btn w-full rounded-full px-6 py-3.5 text-sm"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'view' && viewedContent) {
    return (
      <MemoryView
        fromName={viewedContent.fromName}
        toName={viewedContent.toName}
        message={viewedContent.message}
        photoUrl={viewedContent.photoUrl}
        videoUrl={viewedContent.videoUrl}
        videoDriveId={viewedContent.videoDriveId}
        videoDownloadUrl={viewedContent.videoDownloadUrl}
        audioUrl={viewedContent.audioUrl}
        audioDriveId={viewedContent.audioDriveId}
        audioDownloadUrl={viewedContent.audioDownloadUrl}
      />
    )
  }

  if (screen === 'lookup') {
    return (
      <OrderMemoryLookup
        token={token}
        onFound={(content) => {
          setViewedContent(content)
          setScreen('view')
        }}
      />
    )
  }

  if (screen === 'add') {
    return (
      <GoogleSignInGate required>
        <OrderMemoryForm
          token={token}
          onSaved={(phoneNumber, pin) => {
            setSavedCreds({ phoneNumber, pin })
            setScreen('saved')
          }}
        />
      </GoogleSignInGate>
    )
  }

  return (
    <div className="vintage-page flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="vintage-card w-full max-w-sm p-8">
        <div className="mb-4 text-5xl">🍫</div>
        <h1 className="vintage-heading mb-2 text-2xl">Welcome!</h1>
        <p className="vintage-body mb-6 text-sm text-[#6b5b3d]">
          Did you send a chocolate gift, or did you just receive one?
        </p>
        <div className="space-y-3">
          <button onClick={() => setScreen('add')} className="vintage-btn w-full rounded-full px-6 py-3.5 text-sm">
            📝 I'm Sending — Add a Memory
          </button>
          <button onClick={() => setScreen('lookup')} className="vintage-btn-outline w-full rounded-full px-6 py-3.5 text-sm">
            🔍 I Received — View My Memory
          </button>
        </div>
      </div>
    </div>
  )
}
