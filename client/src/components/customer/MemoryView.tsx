export function MemoryView({
  fromName,
  toName,
  message,
  photoUrl,
  videoUrl,
}: {
  fromName: string | null
  toName: string | null
  message: string | null
  photoUrl: string | null
  videoUrl: string | null
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center bg-gradient-to-b from-rose-50 to-white px-5 py-10 text-center">
      <h1 className="mb-1 text-2xl font-semibold text-rose-600">❤️ A Special Memory For You ❤️</h1>

      {toName && <p className="mt-4 text-sm text-slate-500">TO</p>}
      {toName && <p className="text-lg font-medium text-slate-800">{toName}</p>}

      {videoUrl && (
        <div className="mt-6 w-full overflow-hidden rounded-2xl bg-black shadow-md">
          <iframe
            src={videoUrl}
            className="aspect-[9/16] w-full sm:aspect-video"
            allow="autoplay; fullscreen"
            allowFullScreen
            title="Saved memory video"
          />
        </div>
      )}

      {photoUrl && (
        <img src={photoUrl} alt="Saved memory" className="mt-6 w-full rounded-2xl object-cover shadow-md" />
      )}

      {message && <p className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-slate-700">{message}</p>}

      {fromName && <p className="mt-6 text-sm text-slate-500">FROM</p>}
      {fromName && <p className="text-lg font-medium text-slate-800">{fromName}</p>}
    </div>
  )
}
