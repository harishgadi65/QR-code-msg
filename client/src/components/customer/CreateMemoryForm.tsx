import { useMemo, useRef, useState } from 'react'
import { apiPost, ApiError } from '../../services/api'
import { uploadFileToDrive } from '../../services/driveUpload'
import { readVideoDuration } from '../../utils/videoTrim'
import { VideoTrimmer } from './VideoTrimmer'
import { AudioRecorder } from './AudioRecorder'

const MAX_VIDEO_SECONDS = 30
const MAX_MESSAGE_LENGTH = 500
const MAX_PHOTO_MB = 15
const MAX_VIDEO_MB = 80

type Step = 'form' | 'preview' | 'uploading' | 'success'

export function CreateMemoryForm({ qrId, onSaved }: { qrId: string; onSaved: () => void }) {
  const [step, setStep] = useState<Step>('form')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [pendingTrimFile, setPendingTrimFile] = useState<{ file: File; duration: number } | null>(null)
  const [recordingAudio, setRecordingAudio] = useState(false)
  const [fromName, setFromName] = useState('')
  const [toName, setToName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const photoUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])
  const videoUrl = useMemo(() => (videoFile ? URL.createObjectURL(videoFile) : null), [videoFile])
  const audioUrl = useMemo(() => (audioFile ? URL.createObjectURL(audioFile) : null), [audioFile])

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

  const canSave = Boolean(photoFile || videoFile || audioFile || message.trim())

  const onSubmitPreview = () => {
    if (!canSave) {
      setError('Please add a photo, video, voice message, or message before saving.')
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
      const init = await apiPost<{ accessToken: string; photoFolderId?: string; videoFolderId?: string; audioFolderId?: string }>(
        `/qr/${qrId}/upload-init`,
        { wantsPhoto: Boolean(photoFile), wantsVideo: Boolean(videoFile), wantsAudio: Boolean(audioFile) },
      )
      claimed = true

      // Step 2: upload straight to Drive — never through our own server.
      const totalBytes = (photoFile?.size ?? 0) + (videoFile?.size ?? 0) + (audioFile?.size ?? 0)
      let photoDriveId: string | undefined
      let videoDriveId: string | undefined
      let audioDriveId: string | undefined
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
      if (audioFile && init.audioFolderId) {
        audioDriveId = await uploadFileToDrive(init.accessToken, init.audioFolderId, audioFile, audioFile.name, trackProgress(audioFile.size))
        uploadedSoFar += audioFile.size
      }

      // Step 3: confirm what landed in Drive and save the memory.
      await apiPost(`/qr/${qrId}/finalize`, {
        photoDriveId,
        videoDriveId,
        audioDriveId,
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
      <div className="vintage-page flex flex-col items-center justify-center px-6 py-10 text-center">
        <div className="vintage-card w-full max-w-md p-8">
          <div className="vintage-toran -mx-8 -mt-8 mb-6" />
          <div className="mb-4 text-4xl">🪔</div>
          <h1 className="vintage-heading mb-2 text-2xl">Memory Saved</h1>
          <p className="vintage-body mb-6 text-sm text-[#6b5b3d]">Your keepsake has been archived for safekeeping.</p>
          <button onClick={onSaved} className="vintage-btn w-full px-6 py-3 text-sm">
            View Memory
          </button>
        </div>
      </div>
    )
  }

  if (step === 'uploading') {
    return (
      <div className="vintage-page flex flex-col items-center justify-center px-6 py-10 text-center">
        <div className="vintage-card w-full max-w-md p-8">
          <div className="vintage-toran -mx-8 -mt-8 mb-6" />
          <p className="vintage-eyebrow mb-4 text-xs">Printing your memory…</p>
          <div className="h-2 w-full overflow-hidden border border-[#8a6d3b] bg-[#e8dcc0]">
            <div className="h-full bg-[#7a2e2e] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="vintage-label mt-2 text-xs">{progress}%</p>
        </div>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div className="vintage-page flex flex-col items-center px-5 py-10 text-center">
        <div className="vintage-card w-full max-w-md p-6">
          <div className="vintage-toran -mx-6 -mt-6 mb-4" />
          <p className="vintage-eyebrow text-xs">🪔 Special Edition 🪔</p>
          <h1 className="vintage-heading mt-1 text-2xl">A Memory For You</h1>
          <hr className="vintage-rule my-3" />
          {toName && <p className="vintage-label text-xs">To</p>}
          {toName && <p className="vintage-body text-lg font-medium">{toName}</p>}
          {videoUrl && <video src={videoUrl} controls playsInline className="mt-4 w-full border border-[#8a6d3b] bg-black" />}
          {photoUrl && <img src={photoUrl} alt="Preview" className="mt-4 w-full border border-[#8a6d3b] object-cover" />}
          {audioUrl && <audio src={audioUrl} controls className="mt-4 w-full" />}
          {message && <p className="vintage-body mt-4 whitespace-pre-wrap leading-relaxed">{message}</p>}
          {fromName && <p className="vintage-label mt-4 text-xs">From</p>}
          {fromName && <p className="vintage-body text-lg font-medium">{fromName}</p>}

          {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

          <div className="mt-8 grid w-full grid-cols-2 gap-3">
            <button onClick={() => setStep('form')} className="vintage-btn-outline py-3 text-sm">
              Edit
            </button>
            <button onClick={() => void onSave()} className="vintage-btn py-3 text-sm">
              Save Memory
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="vintage-page flex flex-col items-center px-5 py-10">
      <div className="vintage-card w-full max-w-md p-6">
        <div className="vintage-toran -mx-6 -mt-6 mb-4" />
        <p className="vintage-eyebrow text-center text-xs">🪔 The Gift Gazette 🪔</p>
        <h1 className="vintage-heading mt-1 text-center text-2xl">Create a Special Memory</h1>
        <hr className="vintage-rule my-3" />
        <p className="vintage-body mb-6 text-center text-sm text-[#6b5b3d]">
          Add a photo, video, voice message or note to this gift.
        </p>

        <div className="mb-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          <button onClick={() => photoInputRef.current?.click()} className="vintage-btn-outline py-3 text-xs">
            📷 Add Photo
          </button>
          <button onClick={() => videoInputRef.current?.click()} className="vintage-btn-outline py-3 text-xs">
            🎥 Add Video
          </button>
          <button onClick={() => setRecordingAudio(true)} className="vintage-btn-outline py-3 text-xs">
            🎤 Voice Message
          </button>
        </div>

        <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onPhotoSelected(e.target.files?.[0])} />
        <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => void onVideoSelected(e.target.files?.[0])} />

        {photoUrl && (
          <div className="mb-4 w-full">
            <img src={photoUrl} alt="Selected" className="w-full border border-[#8a6d3b] object-cover" />
            <button onClick={() => setPhotoFile(null)} className="vintage-label mt-1 text-xs underline">
              Remove photo
            </button>
          </div>
        )}
        {videoUrl && (
          <div className="mb-4 w-full">
            <video src={videoUrl} controls playsInline className="w-full border border-[#8a6d3b] bg-black" />
            <button onClick={() => setVideoFile(null)} className="vintage-label mt-1 text-xs underline">
              Remove video
            </button>
          </div>
        )}
        {audioUrl && (
          <div className="mb-4 w-full">
            <audio src={audioUrl} controls className="w-full" />
            <button onClick={() => setAudioFile(null)} className="vintage-label mt-1 text-xs underline">
              Remove voice message
            </button>
          </div>
        )}

        <div className="w-full space-y-4">
          <div>
            <label className="vintage-label mb-1 block text-xs">From</label>
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={60} className="vintage-input w-full px-4 py-3" />
          </div>
          <div>
            <label className="vintage-label mb-1 block text-xs">To</label>
            <input value={toName} onChange={(e) => setToName(e.target.value)} maxLength={60} className="vintage-input w-full px-4 py-3" />
          </div>
          <div>
            <label className="vintage-label mb-1 block text-xs">Your Wish</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={4}
              className="vintage-input w-full px-4 py-3"
            />
            <p className="vintage-label mt-1 text-right text-[10px]">{message.length}/{MAX_MESSAGE_LENGTH}</p>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        <button
          onClick={onSubmitPreview}
          disabled={!canSave}
          className="vintage-btn mt-6 w-full py-3 text-sm"
        >
          Preview Memory
        </button>
      </div>

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

      {recordingAudio && (
        <AudioRecorder
          onCancel={() => setRecordingAudio(false)}
          onConfirm={(file) => {
            setAudioFile(file)
            setRecordingAudio(false)
          }}
        />
      )}
    </div>
  )
}
