import { useEffect, useRef, useState } from 'react'

const MAX_SECONDS = 60

function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) return type
  }
  return undefined
}

// MediaRecorder's native output format depends on the device: Android Chrome
// records audio/webm (Opus), iPhone Safari records audio/mp4 (AAC). Safari on
// iOS cannot play webm/Opus at all — so a voice message recorded on Android
// was silent on every iPhone that later viewed it, while the reverse direction
// worked fine. Decoding the recording and re-encoding it as plain PCM WAV
// (natively playable on every platform) makes the stored file's format the
// same regardless of which device recorded it.
async function convertToWav(blob: Blob): Promise<Blob> {
  const AudioContextCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) throw new Error('Web Audio API unavailable')

  const audioCtx = new AudioContextCtor()
  try {
    const arrayBuffer = await blob.arrayBuffer()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    return encodeWav(audioBuffer)
  } finally {
    void audioCtx.close()
  }
}

// Downmixes to mono (voice messages don't need stereo, and it halves the size)
// and writes a standard 16-bit PCM WAV container.
function encodeWav(audioBuffer: AudioBuffer): Blob {
  const frameCount = audioBuffer.length
  const sampleRate = audioBuffer.sampleRate
  const channels = audioBuffer.numberOfChannels

  const mono = new Float32Array(frameCount)
  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch)
    for (let i = 0; i < frameCount; i++) mono[i] += data[i] / channels
  }

  const dataSize = mono.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate (mono, 16-bit)
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < mono.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, mono[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function extensionForAudioMime(mime: string): string {
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
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
  const [converting, setConverting] = useState(false)
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
        stopStream()
        setConverting(true)
        convertToWav(blob)
          .then(setRecordedBlob)
          .catch((err) => {
            console.error('Could not convert recording to WAV, keeping original format', err)
            setRecordedBlob(blob)
          })
          .finally(() => setConverting(false))
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

        {!recordedBlob && converting && (
          <div className="mb-4 flex flex-col items-center text-sm text-slate-500">Preparing your recording…</div>
        )}

        {!recordedBlob && !converting && (
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
            onClick={() =>
              recordedBlob &&
              onConfirm(new File([recordedBlob], `voice-message.${extensionForAudioMime(recordedBlob.type)}`, { type: recordedBlob.type }))
            }
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
