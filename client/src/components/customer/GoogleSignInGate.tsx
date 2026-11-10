import type { ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth'

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

// Gates only the upload step, not the memory view — recipients scanning a completed
// gift never hit this, only whoever is about to attach the photo/video/message.
// `required` lets callers decide whether sign-in is mandatory (the shared "online
// order" QR always requires it — see pages/customer/OrderQrPage.tsx) or conditional
// on a config flag (the per-gift QR — see pages/customer/MemoryPage.tsx).
export function GoogleSignInGate({ required, children }: { required: boolean; children: ReactNode }) {
  const { user, loading, loginWithGoogle, logout, googleSignInError } = useAuth()

  if (!required) return <>{children}</>
  if (loading) return <CenteredMessage emoji="⏳" title="Loading..." subtitle="" />

  if (!user) {
    return (
      <div className="vintage-page flex flex-col items-center justify-center px-6 text-center">
        <div className="vintage-card w-full max-w-sm p-8">
          <div className="mb-3 text-5xl">🔒</div>
          <h1 className="vintage-heading mb-2 text-xl">Sign in to add your memory</h1>
          <p className="vintage-body mb-6 text-sm text-[#6b5b3d]">
            For security, please sign in with Google before uploading a photo, video, voice message, or note.
          </p>
          <button onClick={() => void loginWithGoogle()} className="vintage-btn w-full rounded-full px-6 py-3.5 text-sm">
            Sign in with Google
          </button>
          {googleSignInError && (
            <p className="mt-4 text-left text-xs break-words text-red-700">{googleSignInError}</p>
          )}
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
