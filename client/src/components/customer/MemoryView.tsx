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
        <div className="vintage-toran -mx-6 -mt-6 mb-4" />
        <p className="vintage-eyebrow text-xs">🪔 Keepsake Edition 🪔</p>
        <h1 className="vintage-heading mt-1 text-2xl">A Special Memory For You</h1>
        <hr className="vintage-rule my-3" />

        {toName && <p className="vintage-label mt-4 text-xs">To</p>}
        {toName && <p className="vintage-body text-lg font-medium">{toName}</p>}

        {videoUrl && (
          <div className="mt-6 w-full overflow-hidden border border-[#8a6d3b] bg-black">
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
          <img src={photoUrl} alt="Saved memory" className="mt-6 w-full border border-[#8a6d3b] object-cover" />
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
            <p className="vintage-label mb-2 text-xs">🎤 Voice Message</p>
            <audio src={audioUrl} controls className="w-full" />
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

        {fromName && <p className="vintage-label mt-6 text-xs">From</p>}
        {fromName && <p className="vintage-body text-lg font-medium">{fromName}</p>}
      </div>
    </div>
  )
}
