import { Router } from 'express'
import { downloadFile, getFileMetadata } from '../googleDrive/driveService'

const router = Router()

const DRIVE_FILE_ID_RE = /^[\w-]{10,100}$/

/**
 * Public, unauthenticated proxy so a gift recipient (never signed in) can play a
 * voice message through a plain <audio> element. Embedding Drive's own /preview
 * page in an <iframe> plays the file fine, but drags in Drive's UI chrome —
 * including a "pop out" button that sends the visitor straight to a raw Google
 * Drive page, which is confusing for someone who just wants to hear a message.
 *
 * Scoped to audio/* only: every audioDriveId that reaches here was already made
 * public (makeFilePublic) at upload time, so this doesn't expose anything that
 * wasn't already public — it just serves the same bytes without Drive's wrapper.
 */
router.get('/audio/:fileId', async (req, res) => {
  const { fileId } = req.params
  if (!DRIVE_FILE_ID_RE.test(fileId)) {
    res.status(400).json({ error: 'Invalid file id.', code: 'INVALID_FILE_ID' })
    return
  }

  try {
    const meta = await getFileMetadata(fileId)
    if (!meta.mimeType.startsWith('audio/')) {
      res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' })
      return
    }

    const buffer = await downloadFile(fileId)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', meta.mimeType)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

    const range = req.headers.range
    if (range) {
      const match = /bytes=(\d+)-(\d+)?/.exec(range)
      const start = match ? Number(match[1]) : 0
      const end = match?.[2] ? Number(match[2]) : buffer.length - 1
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= buffer.length) {
        res.status(416).setHeader('Content-Range', `bytes */${buffer.length}`).end()
        return
      }
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${buffer.length}`)
      res.setHeader('Content-Length', String(end - start + 1))
      res.end(buffer.subarray(start, end + 1))
      return
    }

    res.setHeader('Content-Length', String(buffer.length))
    res.end(buffer)
  } catch (err) {
    console.error('audio proxy failed', err)
    res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' })
  }
})

export default router
