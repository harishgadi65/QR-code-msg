import { FestiveDivider } from './FestiveDivider'

function driveDownloadUrl(driveId: string): string {
  return `https://drive.google.com/uc?export=download&id=${driveId}`
}

export function MemoryView({
  fromName,
  toName,
  message,
  photoUrl,
  photoDriveId,
  videoUrl,
  videoDriveId,
  audioUrl,
  audioDriveId,
}: {
  fromName: string | null
  toName: string | null
  message: string | null
  photoUrl: string | null
  photoDriveId?: string | null
  videoUrl: string | null
  videoDriveId?: string | null
  audioUrl?: string | null
  audioDriveId?: string | null
}) {
  return (
    <div className="vintage-page flex flex-col items-center px-5 py-10 text-center">
      <div className="vintage-card w-full max-w-md p-6">
        <FestiveDivider icon="💐" />
        <h1 className="vintage-heading text-2xl">A Special Memory</h1>
        <h2 className="vintage-script -mt-1 text-3xl leading-tight">For You</h2>

        {toName && <p className="vintage-label mt-4 text-xs uppercase">To</p>}
        {toName && <p className="vintage-body mt-1 text-lg font-medium">{toName}</p>}

        {videoUrl && (
          <div className="mt-6 w-full overflow-hidden rounded-2xl border border-[#e3c691] bg-black">
            <iframe
              src={videoUrl}
              className="aspect-[9/16] w-full sm:aspect-video"
              allow="autoplay; fullscreen"
              allowFullScreen
              title="Saved memory video"
            />
          </div>
        )}
        {videoDriveId && (
          <a
            href={driveDownloadUrl(videoDriveId)}
            target="_blank"
            rel="noreferrer"
            className="vintage-label mt-2 inline-block text-xs underline"
          >
            ⬇ Download video
          </a>
        )}

        {photoUrl && (
          <img src={photoUrl} alt="Saved memory" className="mt-6 w-full rounded-2xl border border-[#e3c691] object-cover" />
        )}
        {photoDriveId && (
          <a
            href={driveDownloadUrl(photoDriveId)}
            target="_blank"
            rel="noreferrer"
            className="vintage-label mt-2 inline-block text-xs underline"
          >
            ⬇ Download photo
          </a>
        )}

        {audioUrl && (
          <div className="mt-6 w-full">
            <p className="vintage-label mb-2 text-xs">🎙️ Voice Message</p>
            <iframe
              src={audioUrl}
              className="h-20 w-full overflow-hidden rounded-2xl border border-[#e3c691]"
              allow="autoplay"
              title="Saved voice message"
            />
            {audioDriveId && (
              <a
                href={driveDownloadUrl(audioDriveId)}
                target="_blank"
                rel="noreferrer"
                className="vintage-label mt-2 inline-block text-xs underline"
              >
                ⬇ Download voice message
              </a>
            )}
          </div>
        )}

        {message && <p className="vintage-body mt-6 whitespace-pre-wrap text-base leading-relaxed">{message}</p>}

        {fromName && <p className="vintage-label mt-6 text-xs uppercase">From</p>}
        {fromName && <p className="vintage-body mt-1 text-lg font-medium">{fromName}</p>}

        <p className="vintage-script mt-6 text-base">Because every gift has a story</p>
      </div>
    </div>
  )
}
