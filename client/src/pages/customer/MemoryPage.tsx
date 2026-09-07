import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet } from '../../services/api'
import { CreateMemoryForm } from '../../components/customer/CreateMemoryForm'
import { MemoryView } from '../../components/customer/MemoryView'

type QrStatusResponse =
  | { status: 'empty' }
  | { status: 'content_added'; fromName: string | null; toName: string | null; message: string | null; photoUrl: string | null; videoUrl: string | null }
  | { status: 'disabled' }
  | { status: 'archived' }
  | { status: 'pending_upload' }
  | { status: 'not_found' }

function CenteredMessage({ emoji, title, subtitle }: { emoji: string; title: string; subtitle: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-5xl">{emoji}</div>
      <h1 className="mb-1 text-xl font-semibold text-slate-800">{title}</h1>
      <p className="text-slate-500">{subtitle}</p>
    </div>
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
          emoji="💔"
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
        />
      )
    case 'empty':
    default:
      return <CreateMemoryForm qrId={qrId} onSaved={load} />
  }
}
