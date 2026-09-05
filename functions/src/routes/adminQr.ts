import { Router } from 'express'
import { db } from '../services/firebaseAdmin'
import { config } from '../config'
import { parseMultipart } from '../middleware/multipart'
import { generateQrSchema, memoryFieldsSchema } from '../utils/validation'
import { allocateBatchId, allocateQrIds } from '../services/idAllocator'
import {
  computeMediaType,
  deleteExistingContentFiles,
  qrRef,
  uploadMediaToDrive,
  now,
} from '../services/memoryService'
import { MediaValidationError, validatePhoto, validateVideoUpload, assertVideoWithinDuration } from '../utils/media'
import type { AuthedRequest } from '../middleware/auth'
import type { QrDoc } from '../types/qr'

const router = Router()
const upload = parseMultipart(Math.max(config.limits.maxPhotoSizeMb, config.limits.maxVideoSizeMb) * 1024 * 1024)

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

async function replaceMedia(req: AuthedRequest, res: import('express').Response, kind: 'photo' | 'video') {
  const file = req.uploadedFiles?.[kind]?.[0]
  if (!file) {
    res.status(400).json({ error: `Please select a ${kind} to upload.`, code: 'MISSING_FILE' })
    return
  }

  try {
    if (kind === 'photo') validatePhoto(file)
    else {
      validateVideoUpload(file)
      await assertVideoWithinDuration(file.buffer)
    }
  } catch (err) {
    if (err instanceof MediaValidationError) {
      res.status(400).json({ error: err.message, code: err.code })
      return
    }
    res.status(400).json({ error: 'Could not process the selected media.', code: 'MEDIA_INVALID' })
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
    const uploaded = await uploadMediaToDrive(
      req.params.qrId,
      kind === 'photo' ? { buffer: file.buffer, mimetype: file.mimetype } : undefined,
      kind === 'video' ? { buffer: file.buffer, mimetype: file.mimetype } : undefined,
    )

    if (kind === 'photo' && data.photoDriveId) await deleteExistingContentFiles({ photoDriveId: data.photoDriveId })
    if (kind === 'video' && data.videoDriveId) await deleteExistingContentFiles({ videoDriveId: data.videoDriveId })

    const photoUrl = kind === 'photo' ? (uploaded.photo?.url ?? null) : data.photoUrl
    const videoUrl = kind === 'video' ? (uploaded.video?.url ?? null) : data.videoUrl

    await ref.update({
      status: 'content_added',
      photoUrl,
      photoDriveId: kind === 'photo' ? (uploaded.photo?.fileId ?? null) : data.photoDriveId,
      videoUrl,
      videoDriveId: kind === 'video' ? (uploaded.video?.fileId ?? null) : data.videoDriveId,
      mediaType: computeMediaType({ photoUrl, videoUrl }),
      updatedAt: now(),
    })

    res.json({ ok: true })
  } catch {
    res.status(502).json({ error: 'Upload failed. Please try again.', code: 'UPLOAD_FAILED' })
  }
}

router.post('/:qrId/photo', upload, (req, res) => replaceMedia(req, res, 'photo'))
router.post('/:qrId/video', upload, (req, res) => replaceMedia(req, res, 'video'))

export default router
