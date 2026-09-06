import { Router } from 'express'
import { db } from '../services/firebaseAdmin'
import { generateQrSchema, memoryFieldsSchema } from '../utils/validation'
import { allocateBatchId, allocateQrIds } from '../services/idAllocator'
import {
  computeMediaType,
  deleteExistingContentFiles,
  qrRef,
  now,
  validateAndPublishDriveUpload,
} from '../services/memoryService'
import { mintUploadAccessToken } from '../googleDrive/driveClient'
import { ensureQrFolder } from '../googleDrive/driveService'
import { MediaValidationError } from '../utils/media'
import type { AuthedRequest } from '../middleware/auth'
import type { QrDoc } from '../types/qr'

const router = Router()

const BATCH_WRITE_CHUNK = 450
const PREFIX_RANGE_SUFFIX = '~' // sorts after digits/uppercase letters used in QR ids

router.post('/generate', async (req: AuthedRequest, res) => {
  const parsed = generateQrSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Please provide a valid quantity (1-100000).', code: 'INVALID_INPUT' })
    return
  }
  const { quantity, batchLabel } = parsed.data

  try {
    const [batchId, qrIds] = await Promise.all([allocateBatchId(), allocateQrIds(quantity)])
    const nowMs = now()

    for (let i = 0; i < qrIds.length; i += BATCH_WRITE_CHUNK) {
      const chunk = qrIds.slice(i, i + BATCH_WRITE_CHUNK)
      const batch = db.batch()
      for (const qrId of chunk) {
        const doc: QrDoc = {
          qrId,
          batchId,
          status: 'empty',
          isTest: false,
          fromName: null,
          toName: null,
          message: null,
          photoUrl: null,
          photoDriveId: null,
          videoUrl: null,
          videoDriveId: null,
          scanCount: 0,
          lastScannedAt: null,
          pendingSince: null,
          createdAt: nowMs,
          updatedAt: nowMs,
        }
        batch.set(qrRef(qrId), doc)
      }
      await batch.commit()
    }

    await db.collection('batches').doc(batchId).set({
      batchId,
      quantity,
      label: batchLabel ?? null,
      startQrId: qrIds[0],
      endQrId: qrIds[qrIds.length - 1],
      createdAt: nowMs,
      createdBy: req.uid ?? null,
    })

    res.json({ batchId, startQrId: qrIds[0], endQrId: qrIds[qrIds.length - 1], quantity })
  } catch {
    res.status(500).json({ error: 'Failed to generate QR codes. Please try again.', code: 'GENERATE_FAILED' })
  }
})

router.get('/', async (req, res) => {
  const { status, batchId, mediaType, search, cursor, limit } = req.query as Record<string, string | undefined>
  const pageSize = Math.min(Number(limit) || 50, 200)

  try {
    let query: FirebaseFirestore.Query = db.collection('qrCodes').where('isTest', '==', false)

    if (search) {
      const prefix = search.toUpperCase()
      query = query.where('qrId', '>=', prefix).where('qrId', '<=', prefix + PREFIX_RANGE_SUFFIX).orderBy('qrId')
    } else {
      if (status) query = query.where('status', '==', status)
      else if (batchId) query = query.where('batchId', '==', batchId)
      else if (mediaType) query = query.where('mediaType', '==', mediaType)
      query = query.orderBy('qrId')
    }

    if (cursor) query = query.startAfter(cursor)
    query = query.limit(pageSize)

    const snap = await query.get()
    const items = snap.docs.map((d) => d.data())
    const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null

    res.json({ items, nextCursor })
  } catch {
    res.status(500).json({ error: 'Failed to load QR codes.', code: 'LIST_FAILED' })
  }
})

router.get('/:qrId', async (req, res) => {
  const snap = await qrRef(req.params.qrId).get()
  if (!snap.exists) {
    res.status(404).json({ error: 'QR code not found.', code: 'NOT_FOUND' })
    return
  }
  res.json(snap.data())
})

router.post('/:qrId/disable', async (req, res) => {
  const ref = qrRef(req.params.qrId)
  const snap = await ref.get()
  if (!snap.exists) {
    res.status(404).json({ error: 'QR code not found.', code: 'NOT_FOUND' })
    return
  }
  const data = snap.data() as QrDoc
  await ref.update({ status: 'disabled', statusBeforeDisable: data.status, updatedAt: now() })
  res.json({ ok: true })
})

router.post('/:qrId/enable', async (req, res) => {
  const ref = qrRef(req.params.qrId)
  const snap = await ref.get()
  if (!snap.exists) {
    res.status(404).json({ error: 'QR code not found.', code: 'NOT_FOUND' })
    return
  }
  const data = snap.data() as QrDoc & { statusBeforeDisable?: QrDoc['status'] }
  const restored = data.statusBeforeDisable ?? 'empty'
  await ref.update({ status: restored, statusBeforeDisable: null, updatedAt: now() })
  res.json({ ok: true })
})

router.delete('/:qrId/content', async (req, res) => {
  const ref = qrRef(req.params.qrId)
  const snap = await ref.get()
  if (!snap.exists) {
    res.status(404).json({ error: 'QR code not found.', code: 'NOT_FOUND' })
    return
  }
  const data = snap.data() as QrDoc
  await deleteExistingContentFiles(data)
  await ref.update({
    status: 'empty',
    fromName: null,
    toName: null,
    message: null,
    photoUrl: null,
    photoDriveId: null,
    videoUrl: null,
    videoDriveId: null,
    mediaType: 'none',
    updatedAt: now(),
  })
  res.json({ ok: true })
})

router.patch('/:qrId/message', async (req, res) => {
  const parsed = memoryFieldsSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the details you entered.', code: 'INVALID_FIELDS' })
    return
  }
  const ref = qrRef(req.params.qrId)
  const snap = await ref.get()
  if (!snap.exists) {
    res.status(404).json({ error: 'QR code not found.', code: 'NOT_FOUND' })
    return
  }
  const data = snap.data() as QrDoc
  const fromName = parsed.data.fromName?.trim() || null
  const toName = parsed.data.toName?.trim() || null
  const message = parsed.data.message?.trim() || null

  const status =
    data.status === 'empty' && (fromName || toName || message || data.photoUrl || data.videoUrl)
      ? 'content_added'
      : data.status

  await ref.update({ fromName, toName, message, status, updatedAt: now() })
  res.json({ ok: true })
})

// Same direct-to-Drive pattern as the customer flow (see routes/customerQr.ts) — the
// admin's browser uploads the file straight to Google using a short-lived token,
// avoiding the small request-body limits serverless hosts like Vercel impose.
router.post('/:qrId/media-upload-init', async (req, res) => {
  const kind = req.body?.kind === 'photo' || req.body?.kind === 'video' ? req.body.kind : null
  if (!kind) {
    res.status(400).json({ error: 'Invalid media kind.', code: 'INVALID_KIND' })
    return
  }
  const snap = await qrRef(req.params.qrId).get()
  if (!snap.exists) {
    res.status(404).json({ error: 'QR code not found.', code: 'NOT_FOUND' })
    return
  }

  try {
    const [accessToken, folderId] = await Promise.all([mintUploadAccessToken(), ensureQrFolder(req.params.qrId, kind)])
    res.json({ accessToken, folderId })
  } catch {
    res.status(502).json({ error: 'Failed to prepare the upload. Please try again.', code: 'UPLOAD_INIT_FAILED' })
  }
})

router.post('/:qrId/media-finalize', async (req: AuthedRequest, res) => {
  const kind = req.body?.kind === 'photo' || req.body?.kind === 'video' ? req.body.kind : null
  const driveId = typeof req.body?.driveId === 'string' ? req.body.driveId : null
  if (!kind || !driveId) {
    res.status(400).json({ error: 'Missing upload details.', code: 'INVALID_INPUT' })
    return
  }

  const ref = qrRef(req.params.qrId)
  const snap = await ref.get()
  if (!snap.exists) {
    res.status(404).json({ error: 'QR code not found.', code: 'NOT_FOUND' })
    return
  }
  const data = snap.data() as QrDoc

  try {
    const { url } = await validateAndPublishDriveUpload(req.params.qrId, kind, driveId)

    if (kind === 'photo' && data.photoDriveId) await deleteExistingContentFiles({ photoDriveId: data.photoDriveId })
    if (kind === 'video' && data.videoDriveId) await deleteExistingContentFiles({ videoDriveId: data.videoDriveId })

    const photoUrl = kind === 'photo' ? url : data.photoUrl
    const videoUrl = kind === 'video' ? url : data.videoUrl

    await ref.update({
      status: 'content_added',
      photoUrl,
      photoDriveId: kind === 'photo' ? driveId : data.photoDriveId,
      videoUrl,
      videoDriveId: kind === 'video' ? driveId : data.videoDriveId,
      mediaType: computeMediaType({ photoUrl, videoUrl }),
      updatedAt: now(),
    })

    res.json({ ok: true })
  } catch (err) {
    if (err instanceof MediaValidationError) {
      res.status(400).json({ error: err.message, code: err.code })
      return
    }
    res.status(502).json({ error: 'Upload failed. Please try again.', code: 'UPLOAD_FAILED' })
  }
})

export default router
