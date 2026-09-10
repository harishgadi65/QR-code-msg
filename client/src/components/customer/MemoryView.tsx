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
    try {
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
              {/* html2canvas can't render <video> frames — it would just paint this
                  box solid black in the downloaded keepsake image — so it's skipped
                  from that capture and the label above stands in for it there. */}
              <div data-html2canvas-ignore className="w-full overflow-hidden rounded-2xl border border-[#e3c691] bg-black">
                <video src={videoProxyUrl(videoDriveId)} controls playsInline className="aspect-[9/16] w-full sm:aspect-video" />
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
