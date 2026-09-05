import { useEffect, useMemo, useRef, useState } from 'react'
import { trimVideo } from '../../utils/videoTrim'

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function VideoTrimmer({
  file,
  duration,
  maxDuration,
  onCancel,
  onConfirm,
}: {
  file: File
  duration: number
  maxDuration: number
  onCancel: () => void
  onConfirm: (trimmed: File) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(Math.min(maxDuration, duration))
  const [previewing, setPreviewing] = useState(false)
  const [trimming, setTrimming] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const src = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(src), [src])

  const selectedDuration = end - start

  const onStartChange = (value: number) => {
    const clamped = Math.min(value, end - 1)
    setStart(clamped)
    if (end - clamped > maxDuration) setEnd(clamped + maxDuration)
  }

  const onEndChange = (value: number) => {
    const clamped = Math.max(value, start + 1)
    setEnd(clamped)
    if (clamped - start > maxDuration) setStart(clamped - maxDuration)
  }

  const onPreview = () => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = start
    video.play().catch(() => undefined)
    setPreviewing(true)
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video || !previewing) return
    const onTimeUpdate = () => {
      if (video.currentTime >= end) {
        video.pause()
        setPreviewing(false)
      }
    }
    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [previewing, end])

  const onTrimAndUse = async () => {
    setError(null)
    setTrimming(true)
    setProgress(0)
    try {
      const trimmed = await trimVideo(file, start, end, setProgress)
      onConfirm(trimmed)
    } catch {
      setError('Could not trim this video. Please try a different file.')
    } finally {
      setTrimming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="mb-1 text-lg font-semibold">Trim your video</h3>
        <p className="mb-4 text-sm text-slate-500">
          Original: {formatTime(duration)} · Select up to {formatTime(maxDuration)}
        </p>

        <video ref={videoRef} src={src} controls={false} className="mb-3 w-full rounded-lg bg-black" />

        <div className="mb-2 flex justify-between text-xs text-slate-500">
          <span>Start: {formatTime(start)}</span>
          <span>End: {formatTime(end)}</span>
        </div>

        <label className="mb-1 block text-xs text-slate-500">Start time</label>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={start}
          onChange={(e) => onStartChange(Number(e.target.value))}
          className="mb-3 w-full"
        />
        <label className="mb-1 block text-xs text-slate-500">End time</label>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={end}
          onChange={(e) => onEndChange(Number(e.target.value))}
          className="mb-3 w-full"
        />

        <p className="mb-4 text-center text-sm font-medium text-slate-700">
          Selected duration: {formatTime(selectedDuration)} / {formatTime(maxDuration)}
        </p>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {trimming ? (
          <div>
            <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-rose-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="text-center text-sm text-slate-500">Trimming video... {Math.round(progress * 100)}%</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button onClick={onCancel} className="rounded-lg border border-slate-300 py-2 text-sm">
              Cancel
            </button>
            <button onClick={onPreview} className="rounded-lg border border-slate-300 py-2 text-sm">
              Preview
            </button>
            <button onClick={() => void onTrimAndUse()} className="rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white">
              Trim &amp; Use
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
