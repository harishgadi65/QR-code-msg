import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import toast from 'react-hot-toast'
import { FestiveDivider } from './FestiveDivider'
import { audioDownloadUrl, audioProxyUrl, videoDownloadUrl, videoProxyUrl } from '../../services/api'

// A cross-origin URL whose response carries Content-Disposition: attachment
// (see audioDownloadUrl/videoDownloadUrl) downloads on click without ever
// navigating the page away — no fetch/blob juggling needed.
function triggerDownload(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// Grabs a still frame from the on-page <video> so the downloaded card can show
// something in the video's spot instead of a blank label — same idea as a photo.
// html2canvas itself can't render live <video> content, so this draws straight
// from the element onto a canvas instead. Resolves null (never throws) if the
// video hasn't buffered enough to draw from yet, so callers can fall back
// gracefully rather than the whole download failing.
function captureVideoFrame(video: HTMLVideoElement): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const originalTime = video.currentTime
    const finish = (result: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.currentTime = originalTime
      resolve(result)
    }
    const timer = setTimeout(() => finish(null), 6000)

    const draw = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx || !canvas.width || !canvas.height) {
          finish(null)
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/png'))
      } catch (err) {
        console.error('video frame capture failed', err)
        finish(null)
      }
    }

    const seekToFrame = () => {
      // A touch past the very start, which is often a black/fade-in frame.
      const target = video.duration ? Math.min(0.5, video.duration / 4) : 0
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        draw()
      }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = target
    }

    if (video.readyState >= 2) {
      seekToFrame()
    } else {
      const onLoadedData = () => {
        video.removeEventListener('loadeddata', onLoadedData)
        seekToFrame()
      }
      video.addEventListener('loadeddata', onLoadedData)
    }
  })
}

export function MemoryView({
  fromName,
  toName,
  message,
  photoUrl,
  videoUrl,
  videoDriveId,
  audioUrl,
  audioDriveId,
}: {
  fromName: string | null
  toName: string | null
  message: string | null
  photoUrl: string | null
  videoUrl: string | null
  videoDriveId?: string | null
  audioUrl?: string | null
  audioDriveId?: string | null
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [downloadingCard, setDownloadingCard] = useState(false)

  // Two separate buttons, each needing its own tap. Firing the media file
  // download and the card screenshot download together from one tap worked
  // on desktop, but real phones (Android Chrome in particular) silently
  // block the second automatic download that follows right after the
  // first — only the video/voice file came through, the card never did.
  // Requiring a distinct tap per download sidesteps that entirely.
  function handleDownloadMedia() {
    if (videoDriveId) triggerDownload(videoDownloadUrl(videoDriveId))
    else if (audioDriveId) triggerDownload(audioDownloadUrl(audioDriveId))
  }

  async function handleDownloadCard() {
    if (!contentRef.current) return
    setDownloadingCard(true)
    let insertedFrame: HTMLImageElement | null = null
    try {
      if (videoDriveId && videoRef.current) {
        const frameDataUrl = await captureVideoFrame(videoRef.current)
        const ignoredWrapper = contentRef.current.querySelector<HTMLElement>('[data-html2canvas-ignore]')
        if (frameDataUrl && ignoredWrapper?.parentElement) {
          insertedFrame = document.createElement('img')
          insertedFrame.src = frameDataUrl
          insertedFrame.className = 'w-full overflow-hidden rounded-2xl border border-[#e3c691] object-cover'
          ignoredWrapper.parentElement.insertBefore(insertedFrame, ignoredWrapper)
          await insertedFrame.decode().catch(() => undefined)
        }
      }

      const canvas = await html2canvas(contentRef.current, { backgroundColor: '#fdfbf4', scale: 2, useCORS: true })
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = 'memory.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error('screenshot download failed', err)
      toast.error('Could not prepare the download. Please try again.')
    } finally {
      insertedFrame?.remove()
      setDownloadingCard(false)
    }
  }

  return (
    <div className="vintage-page flex flex-col items-center px-5 py-10 text-center">
      <div className="vintage-card w-full max-w-md p-6">
        <div ref={contentRef}>
          <FestiveDivider icon="💐" />
          <h1 className="vintage-heading text-2xl">A Special Memory</h1>
          <h2 className="vintage-script -mt-1 text-3xl leading-tight">For You</h2>

          {toName && <p className="vintage-label mt-4 text-xs uppercase">To</p>}
          {toName && <p className="vintage-body mt-1 text-lg font-medium">{toName}</p>}

          {videoUrl && videoDriveId && (
            <div className="mt-6 w-full">
              <p className="vintage-label mb-2 text-xs">🎥 Video Message</p>
              {/* html2canvas can't render live <video> content — it would just paint
                  this box solid black in the downloaded card — so it's skipped from
                  that capture. handleDownloadCard swaps in a captured still frame
                  here instead (falling back to just this label if that fails). */}
              <div data-html2canvas-ignore className="w-full overflow-hidden rounded-2xl border border-[#e3c691] bg-black">
                <video
                  ref={videoRef}
                  src={videoProxyUrl(videoDriveId)}
                  controls
                  playsInline
                  preload="auto"
                  crossOrigin="anonymous"
                  className="aspect-[9/16] w-full sm:aspect-video"
                />
              </div>
            </div>
          )}

          {photoUrl && (
            <img
              src={photoUrl}
              alt="Saved memory"
              crossOrigin="anonymous"
              className="mt-6 w-full rounded-2xl border border-[#e3c691] object-cover"
            />
          )}

          {audioUrl && audioDriveId && (
            <div className="mt-6 w-full">
              <p className="vintage-label mb-2 text-xs">🎙️ Voice Message</p>
              <audio src={audioProxyUrl(audioDriveId)} controls className="w-full" />
            </div>
          )}

          {message && <p className="vintage-body mt-6 whitespace-pre-wrap text-base leading-relaxed">{message}</p>}

          {fromName && <p className="vintage-label mt-6 text-xs uppercase">From</p>}
          {fromName && <p className="vintage-body mt-1 text-lg font-medium">{fromName}</p>}

          <p className="vintage-script mt-6 text-base">Because every gift has a story</p>
        </div>

        <div className="mt-6 flex w-full flex-col gap-2">
          {(videoDriveId || audioDriveId) && (
            <button onClick={handleDownloadMedia} className="vintage-btn w-full rounded-full py-3 text-sm">
              {videoDriveId ? '⬇ Download Video' : '⬇ Download Voice Message'}
            </button>
          )}
          <button
            onClick={() => void handleDownloadCard()}
            disabled={downloadingCard}
            className={
              videoDriveId || audioDriveId
                ? 'vintage-btn-outline w-full rounded-full py-3 text-sm disabled:opacity-60'
                : 'vintage-btn w-full rounded-full py-3 text-sm disabled:opacity-60'
            }
          >
            {downloadingCard ? 'Preparing…' : '⬇ Download Card'}
          </button>
        </div>
      </div>
    </div>
  )
}
