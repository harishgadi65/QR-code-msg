import { useMemo, useRef, useState } from 'react'
import { apiPost, ApiError } from '../../services/api'
import { uploadFileToDrive } from '../../services/driveUpload'
import { readVideoDuration } from '../../utils/videoTrim'
import { VideoTrimmer } from './VideoTrimmer'

const MAX_VIDEO_SECONDS = 30
const MAX_MESSAGE_LENGTH = 500
const MAX_PHOTO_MB = 15
const MAX_VIDEO_MB = 80

type Step = 'form' | 'preview' | 'uploading' | 'success'

export function CreateMemoryForm({ qrId, onSaved }: { qrId: string; onSaved: () => void }) {
  const [step, setStep] = useState<Step>('form')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [pendingTrimFile, setPendingTrimFile] = useState<{ file: File; duration: number } | null>(null)
  const [fromName, setFromName] = useState('')
  const [toName, setToName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const photoUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])
  const videoUrl = useMemo(() => (videoFile ? URL.createObjectURL(videoFile) : null), [videoFile])

  const onPhotoSelected = (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please choose a JPG, PNG, or WEBP photo.')
      return
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError(`Photo must be smaller than ${MAX_PHOTO_MB}MB.`)
      return
    }
    setPhotoFile(file)
  }

  const onVideoSelected = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) {
      setError('Please choose an MP4, MOV, or WebM video.')
      return
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`This video is too large (max ${MAX_VIDEO_MB}MB for a ${MAX_VIDEO_SECONDS}s clip). Please choose a shorter or lower-quality video.`)
      return
    }
    try {
      const duration = await readVideoDuration(file)
      if (duration > MAX_VIDEO_SECONDS + 0.5) {
        setPendingTrimFile({ file, duration })
      } else {
        setVideoFile(file)
      }
    } catch {
      setError('Could not read this video. Please try another file.')
    }
  }

  const canSave = Boolean(photoFile || videoFile || message.trim())

  const onSubmitPreview = () => {
    if (!canSave) {
      setError('Please add a photo, video, or message before saving.')
      return
    }
    setError(null)
    setStep('preview')
  }

  const onSave = async () => {
    setStep('uploading')
    setError(null)
    setProgress(0)

    let claimed = false
    try {
      // Step 1: claim the QR and get a short-lived Drive upload token.
      const init = await apiPost<{ accessToken: string; photoFolderId?: string; videoFolderId?: string }>(
        `/qr/${qrId}/upload-init`,
        { wantsPhoto: Boolean(photoFile), wantsVideo: Boolean(videoFile) },
      )
      claimed = true

      // Step 2: upload straight to Drive — never through our own server.
      const totalBytes = (photoFile?.size ?? 0) + (videoFile?.size ?? 0)
      let photoDriveId: string | undefined
      let videoDriveId: string | undefined
      let uploadedSoFar = 0

      const trackProgress = (fileSize: number) => (pct: number) => {
        if (!totalBytes) return
        setProgress(Math.round(((uploadedSoFar + (fileSize * pct) / 100) / totalBytes) * 100))
      }

      if (photoFile && init.photoFolderId) {
        photoDriveId = await uploadFileToDrive(init.accessToken, init.photoFolderId, photoFile, photoFile.name, trackProgress(photoFile.size))
        uploadedSoFar += photoFile.size
      }
      if (videoFile && init.videoFolderId) {
        videoDriveId = await uploadFileToDrive(init.accessToken, init.videoFolderId, videoFile, videoFile.name, trackProgress(videoFile.size))
        uploadedSoFar += videoFile.size
      }

      // Step 3: confirm what landed in Drive and save the memory.
      await apiPost(`/qr/${qrId}/finalize`, {
        photoDriveId,
        videoDriveId,
        fromName: fromName.trim() || undefined,
        toName: toName.trim() || undefined,
        message: message.trim() || undefined,
      })

      setStep('success')
    } catch (err) {
      if (claimed) await apiPost(`/qr/${qrId}/cancel-upload`).catch(() => undefined)
      setError(err instanceof ApiError ? err.message : 'Something went wrong while saving your memory. Please try again.')
      setStep('preview')
    }
  }

  if (step === 'success') {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 text-5xl">❤️</div>
        <h1 className="mb-2 text-xl font-semibold text-slate-800">Your memory has been saved!</h1>
        <button onClick={onSaved} className="mt-4 rounded-full bg-rose-600 px-6 py-3 font-semibold text-white">
          Watch Video
        </button>
      </div>
    )
  }

  if (step === 'uploading') {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="mb-3 text-slate-600">Uploading...</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-rose-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-500">{progress}%</p>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center px-5 py-10 text-center">
        <h1 className="mb-4 text-xl font-semibold text-rose-600">❤️ A Special Memory ❤️</h1>
        {toName && <p className="text-sm text-slate-500">TO: {toName}</p>}
        {videoUrl && <video src={videoUrl} controls playsInline className="mt-4 w-full rounded-2xl bg-black" />}
        {photoUrl && <img src={photoUrl} alt="Preview" className="mt-4 w-full rounded-2xl object-cover" />}
        {message && <p className="mt-4 whitespace-pre-wrap text-slate-700">{message}</p>}
        {fromName && <p className="mt-4 text-sm text-slate-500">FROM: {fromName}</p>}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-8 grid w-full grid-cols-2 gap-3">
          <button onClick={() => setStep('form')} className="rounded-full border border-slate-300 py-3 font-medium">
            Edit
          </button>
          <button onClick={() => void onSave()} className="rounded-full bg-rose-600 py-3 font-semibold text-white">
            Save Memory
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center px-5 py-10">
      <h1 className="mb-1 text-center text-xl font-semibold text-rose-600">❤️ Create a Special Memory</h1>
      <p className="mb-6 text-center text-sm text-slate-500">Add a photo, video or message to this gift.</p>

      <div className="mb-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <button onClick={() => photoInputRef.current?.click()} className="rounded-xl border border-rose-200 bg-rose-50 py-3 font-medium text-rose-700">
          📷 Add Photo
        </button>
        <button onClick={() => videoInputRef.current?.click()} className="rounded-xl border border-rose-200 bg-rose-50 py-3 font-medium text-rose-700">
          🎥 Add Video
        </button>
      </div>

      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onPhotoSelected(e.target.files?.[0])} />
      <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => void onVideoSelected(e.target.files?.[0])} />

      {photoUrl && (
        <div className="mb-4 w-full">
          <img src={photoUrl} alt="Selected" className="w-full rounded-xl object-cover" />
          <button onClick={() => setPhotoFile(null)} className="mt-1 text-sm text-slate-500 underline">
            Remove photo
          </button>
        </div>
      )}
      {videoUrl && (
        <div className="mb-4 w-full">
          <video src={videoUrl} controls playsInline className="w-full rounded-xl bg-black" />
          <button onClick={() => setVideoFile(null)} className="mt-1 text-sm text-slate-500 underline">
            Remove video
          </button>
        </div>
      )}

      <div className="w-full space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">FROM</label>
          <input value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={60} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">TO</label>
          <input value={toName} onChange={(e) => setToName(e.target.value)} maxLength={60} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">YOUR WISH</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={4}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
          <p className="mt-1 text-right text-xs text-slate-400">{message.length}/{MAX_MESSAGE_LENGTH}</p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={onSubmitPreview}
        disabled={!canSave}
        className="mt-6 w-full rounded-full bg-rose-600 py-3 font-semibold text-white disabled:opacity-40"
      >
        Preview Memory
      </button>

      {pendingTrimFile && (
        <VideoTrimmer
          file={pendingTrimFile.file}
          duration={pendingTrimFile.duration}
          maxDuration={MAX_VIDEO_SECONDS}
          onCancel={() => setPendingTrimFile(null)}
          onConfirm={(trimmed) => {
            setVideoFile(trimmed)
            setPendingTrimFile(null)
          }}
        />
      )}
    </div>
  )
}
