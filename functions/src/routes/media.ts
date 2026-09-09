import { Router, type Request, type Response } from 'express'
import { getFileMetadata, getFileStream } from '../googleDrive/driveService'

const router = Router()

const DRIVE_FILE_ID_RE = /^[\w-]{10,100}$/

/**
 * Public, unauthenticated proxy so a gift recipient (never signed in) can play a
 * saved photo/video/voice message through a plain <audio>/<video> element instead
 * of Drive's own /preview page. That page works, but drags in Drive's UI chrome —
 * a "pop out" button that sends the visitor straight to a raw Google Drive page,
 * and (for videos Drive hasn't finished transcoding yet) a "still being processed
 * for playback" overlay. Streaming the original uploaded bytes directly sidesteps
 * both: there's no Drive UI at all, and no dependency on Drive's own transcode.
 *
 * Scoped by mimePrefix ('audio/' or 'video/'): every fileId that reaches here was
 * already made public (makeFilePublic) at upload time, so this doesn't expose
 * anything that wasn't already public — it just serves the same bytes unwrapped.
 * Never buffers the whole file in memory: the client's Range header (which
 * <video>/<audio> elements send on their own to buffer incrementally) is forwarded
 * straight through to the Drive API, which streams back only that slice.
 */
function streamMedia(mimePrefix: 'audio/' | 'video/') {
  return async (req: Request, res: Response) => {
    const { fileId } = req.params
    if (!DRIVE_FILE_ID_RE.test(fileId)) {
      res.status(400).json({ error: 'Invalid file id.', code: 'INVALID_FILE_ID' })
      return
    }

    try {
      const meta = await getFileMetadata(fileId)
      if (!meta.mimeType.startsWith(mimePrefix)) {
        res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' })
        return
      }

      const range = req.headers.range
      const file = await getFileStream(fileId, range)

      res.status(file.status)
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Content-Type', file.contentType ?? meta.mimeType)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      if (file.contentLength) res.setHeader('Content-Length', file.contentLength)
      if (file.contentRange) res.setHeader('Content-Range', file.contentRange)

      file.stream.on('error', (err) => {
        console.error('media stream failed mid-response', err)
        res.destroy()
      })
      file.stream.pipe(res)
    } catch (err) {
      console.error('media proxy failed', err)
      if (!res.headersSent) res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' })
    }
  }
}

router.get('/audio/:fileId', streamMedia('audio/'))
router.get('/video/:fileId', streamMedia('video/'))

export default router
