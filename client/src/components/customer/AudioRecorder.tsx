import { useEffect, useRef, useState } from 'react'

const MAX_SECONDS = 60

function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) return type
  }
  return undefined
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function AudioRecorder({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (file: File) => void }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    stopStream()
  }, [])

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType ?? 'audio/webm' })
        setRecordedBlob(blob)
        stopStream()
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) {
            mediaRecorderRef.current?.stop()
            if (timerRef.current) clearInterval(timerRef.current)
            setRecording(false)
            return MAX_SECONDS
          }
          return s + 1
        })
      }, 1000)
    } catch {
      setError('Could not access your microphone. Please check permissions and try again.')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setRecording(false)
  }

  const reRecord = () => {
    setRecordedBlob(null)
    setSeconds(0)
  }

  const previewUrl = recordedBlob ? URL.createObjectURL(recordedBlob) : null
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="mb-1 text-lg font-semibold">Record a voice message</h3>
        <p className="mb-4 text-sm text-slate-500">Up to {formatTime(MAX_SECONDS)}</p>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {!recordedBlob && (
          <div className="mb-4 flex flex-col items-center">
            <div className="mb-4 text-3xl font-mono text-slate-700">{formatTime(seconds)}</div>
            {recording ? (
              <button onClick={stopRecording} className="rounded-full bg-red-600 px-6 py-3 font-semibold text-white">
                ⏹ Stop
              </button>
            ) : (
              <button onClick={() => void startRecording()} className="rounded-full bg-rose-600 px-6 py-3 font-semibold text-white">
                🎤 Start Recording
              </button>
            )}
          </div>
        )}

        {recordedBlob && previewUrl && (
          <div className="mb-4">
            <audio src={previewUrl} controls className="w-full" />
            <button onClick={reRecord} className="mt-2 text-sm text-slate-500 underline">
              Re-record
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-300 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => recordedBlob && onConfirm(new File([recordedBlob], 'voice-message.webm', { type: recordedBlob.type }))}
            disabled={!recordedBlob}
            className="rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Use Recording
          </button>
        </div>
      </div>
    </div>
  )
}
