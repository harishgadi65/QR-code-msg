import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet } from '../../services/api'
import { CreateMemoryForm } from '../../components/customer/CreateMemoryForm'
import { GoogleSignInGate } from '../../components/customer/GoogleSignInGate'
import { MemoryView } from '../../components/customer/MemoryView'
import { PinGate, type MemoryContent } from '../../components/customer/PinGate'

type QrStatusResponse =
  | { status: 'empty' }
  | MemoryContent
  | { status: 'disabled' }
  | { status: 'archived' }
  | { status: 'expired' }
  | { status: 'scan_limit_reached' }
  | { status: 'pin_required' }
  | { status: 'pending_upload' }
  | { status: 'not_found' }

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

// Off by default: flips on once Google sign-in is enabled in the Firebase console
// and the team is ready to require it before a customer can upload — see
// functions/src/config.ts's matching REQUIRE_UPLOAD_SIGNIN flag.
const REQUIRE_UPLOAD_SIGNIN = import.meta.env.VITE_REQUIRE_UPLOAD_SIGNIN === 'true'

export function MemoryPage() {
  const { qrId } = useParams<{ qrId: string }>()
  const [data, setData] = useState<QrStatusResponse | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    if (!qrId) return
    apiGet<QrStatusResponse>(`/qr/${qrId}`)
      .then(setData)
      .catch(() => setError(true))
  }, [qrId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (data?.status !== 'pending_upload') return
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [data, load])

  if (!qrId) return <CenteredMessage emoji="🔍" title="QR Code Not Found" subtitle="This QR code is not registered." />
  if (error) return <CenteredMessage emoji="⚠️" title="Something went wrong" subtitle="Please try again in a moment." />
  if (!data) return <CenteredMessage emoji="⏳" title="Loading..." subtitle="" />

  switch (data.status) {
    case 'not_found':
      return <CenteredMessage emoji="🔍" title="QR Code Not Found" subtitle="This QR code is not registered." />
    case 'disabled':
      return <CenteredMessage emoji="🚫" title="QR Code Unavailable" subtitle="This QR code is currently unavailable." />
    case 'archived':
      return (
        <CenteredMessage
          emoji="💐"
          title="Memory No Longer Available"
          subtitle="This memorable message is no longer available."
        />
      )
    case 'expired':
      return (
        <CenteredMessage
          emoji="💐"
          title="This Memory Has Expired"
          subtitle="The sender set this memory to be available for a limited time, and that time has passed."
        />
      )
    case 'scan_limit_reached':
      return (
        <CenteredMessage
          emoji="💐"
          title="View Limit Reached"
          subtitle="The sender limited how many times this memory could be viewed, and that limit has been reached."
        />
      )
    case 'pin_required':
      return <PinGate qrId={qrId} onUnlocked={setData} />
    case 'pending_upload':
      return <CenteredMessage emoji="⏳" title="Saving in progress" subtitle="Someone is currently saving a memory to this QR. Please check back shortly." />
    case 'content_added':
      return (
        <MemoryView
          fromName={data.fromName}
          toName={data.toName}
          message={data.message}
          photoUrl={data.photoUrl}
          videoUrl={data.videoUrl}
          videoDriveId={data.videoDriveId}
          videoDownloadUrl={data.videoDownloadUrl}
          audioUrl={data.audioUrl}
          audioDriveId={data.audioDriveId}
          audioDownloadUrl={data.audioDownloadUrl}
        />
      )
    case 'empty':
    default:
      return (
        <GoogleSignInGate required={REQUIRE_UPLOAD_SIGNIN}>
          <CreateMemoryForm qrId={qrId} onSaved={load} />
        </GoogleSignInGate>
      )
  }
}
