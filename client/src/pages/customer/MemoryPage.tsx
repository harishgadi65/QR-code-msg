import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { CreateMemoryForm } from '../../components/customer/CreateMemoryForm'
import { MemoryView } from '../../components/customer/MemoryView'

type QrStatusResponse =
  | { status: 'empty' }
  | {
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
  | { status: 'disabled' }
  | { status: 'archived' }
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

// Gates only the upload step, not the memory view — recipients scanning a completed
// gift never hit this, only whoever is about to attach the photo/video/message.
function UploadAuthGate({ children }: { children: ReactNode }) {
  const { user, loading, loginWithGoogle, logout } = useAuth()

  if (!REQUIRE_UPLOAD_SIGNIN) return <>{children}</>
  if (loading) return <CenteredMessage emoji="⏳" title="Loading..." subtitle="" />

  if (!user) {
    return (
      <div className="vintage-page flex flex-col items-center justify-center px-6 text-center">
        <div className="vintage-card w-full max-w-sm p-8">
          <div className="mb-3 text-5xl">🔒</div>
          <h1 className="vintage-heading mb-2 text-xl">Sign in to add your memory</h1>
          <p className="vintage-body mb-6 text-sm text-[#6b5b3d]">
            For security, please sign in with Google before uploading a photo, video, voice message, or note to this
            gift.
          </p>
          <button onClick={() => void loginWithGoogle()} className="vintage-btn w-full rounded-full px-6 py-3.5 text-sm">
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="vintage-eyebrow relative z-10 flex items-center justify-center gap-3 border-b border-[#e3c691] bg-[#fdf0d2] px-4 py-2 text-[11px]">
        <span>Signed in as {user.email}</span>
        <button onClick={() => void logout()} className="underline">
          Sign out
        </button>
      </div>
      {children}
    </>
  )
}

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
          audioUrl={data.audioUrl}
          audioDriveId={data.audioDriveId}
        />
      )
    case 'empty':
    default:
      return (
        <UploadAuthGate>
          <CreateMemoryForm qrId={qrId} onSaved={load} />
        </UploadAuthGate>
      )
  }
}
