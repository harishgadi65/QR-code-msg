import { Router } from 'express'
import { db } from '../services/firebaseAdmin'
import { config } from '../config'
import { parseMultipart } from '../middleware/multipart'
import { qrIdSchema, memoryFieldsSchema } from '../utils/validation'
import {
  MediaValidationError,
  validatePhoto,
  validateVideoUpload,
  assertVideoWithinDuration,
} from '../utils/media'
import { uploadMediaToDrive, computeMediaType, qrRef, now } from '../services/memoryService'
import type { QrDoc } from '../types/qr'

const router = Router()

const upload = parseMultipart(Math.max(config.limits.maxPhotoSizeMb, config.limits.maxVideoSizeMb) * 1024 * 1024)

function friendlyError(res: import('express').Response, status: number, message: string, code?: string) {
  res.status(status).json({ error: message, code })
}

router.get('/:qrId', async (req, res) => {
  const parsed = qrIdSchema.safeParse(req.params.qrId)
  if (!parsed.success) {
    // "not found" is a normal page state for the customer view, not an HTTP-level
    // error, so it's always a 200 body with a status field — same as empty/disabled/etc.
    res.json({ status: 'not_found' })
    return
  }
  const qrId = parsed.data

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(qrRef(qrId))
      if (!snap.exists) return { status: 'not_found' as const }

      const data = snap.data() as QrDoc
      const nowMs = now()

      // Auto-recover a claim that was abandoned mid-upload (e.g. server crash).
      if (data.status === 'pending_upload' && data.pendingSince && nowMs - data.pendingSince > config.limits.pendingUploadTimeoutMs) {
        tx.update(qrRef(qrId), { status: 'empty', pendingSince: null, updatedAt: nowMs })
        data.status = 'empty'
      }

      if (data.status !== 'disabled') {
        tx.update(qrRef(qrId), { scanCount: (data.scanCount ?? 0) + 1, lastScannedAt: nowMs })
      }

      return { status: data.status, data }
    })

    if (result.status === 'not_found') {
      res.json({ status: 'not_found' })
      return
    }
    if (result.status === 'disabled') {
      res.json({ status: 'disabled' })
      return
    }
    if (result.status === 'pending_upload') {
      res.json({ status: 'pending_upload' })
      return
    }
    if (result.status === 'content_added') {
      const d = result.data!
      res.json({
        status: 'content_added',
        fromName: d.fromName,
        toName: d.toName,
        message: d.message,
        photoUrl: d.photoUrl,
        videoUrl: d.videoUrl,
      })
      return
    }
    res.json({ status: 'empty', isTest: result.data?.isTest ?? false })
  } catch {
    friendlyError(res, 500, 'Something went wrong. Please try again.', 'INTERNAL')
  }
})

router.post(
  '/:qrId/memory',
  upload,
  async (req, res) => {
    const parsedId = qrIdSchema.safeParse(req.params.qrId)
    if (!parsedId.success) {
      friendlyError(res, 404, 'This QR code is not registered.', 'NOT_FOUND')
      return
    }
    const qrId = parsedId.data

    const fields = memoryFieldsSchema.safeParse(req.body)
    if (!fields.success) {
      friendlyError(res, 400, 'Please check the details you entered.', 'INVALID_FIELDS')
      return
    }

    const files = req.uploadedFiles
    const photoFile = files?.photo?.[0]
    const videoFile = files?.video?.[0]

    const fromName = fields.data.fromName?.trim() || null
    const toName = fields.data.toName?.trim() || null
    const message = fields.data.message?.trim() || null

    if (!photoFile && !videoFile && !message) {
      friendlyError(res, 400, 'Please add a photo, video, or message before saving.', 'EMPTY_MEMORY')
      return
    }

    try {
      if (photoFile) validatePhoto(photoFile)
      if (videoFile) {
        validateVideoUpload(videoFile)
        await assertVideoWithinDuration(videoFile.buffer)
      }
    } catch (err) {
      if (err instanceof MediaValidationError) {
        friendlyError(res, 400, err.message, err.code)
        return
      }
      friendlyError(res, 400, 'Could not process the selected media.', 'MEDIA_INVALID')
      return
    }

    // Phase 1: atomically claim the QR so a second concurrent request can't also proceed.
    const claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(qrRef(qrId))
      if (!snap.exists) return { ok: false as const, reason: 'not_found' as const }
      const data = snap.data() as QrDoc

      if (data.status === 'disabled') return { ok: false as const, reason: 'disabled' as const }
      if (data.status === 'content_added') return { ok: false as const, reason: 'already_added' as const }
      if (data.status === 'pending_upload') {
        const timedOut = data.pendingSince != null && now() - data.pendingSince > config.limits.pendingUploadTimeoutMs
        if (!timedOut) return { ok: false as const, reason: 'in_progress' as const }
      }

      tx.update(qrRef(qrId), { status: 'pending_upload', pendingSince: now(), updatedAt: now() })
      return { ok: true as const }
    })

    if (!claim.ok) {
      const messages: Record<string, string> = {
        not_found: 'This QR code is not registered.',
        disabled: 'This QR code is currently unavailable.',
        already_added: 'This QR code already has a saved memory.',
        in_progress: 'Someone is already saving a memory to this QR. Please try again shortly.',
      }
      friendlyError(res, 409, messages[claim.reason], claim.reason.toUpperCase())
      return
    }

    // Phase 2: upload to Drive outside the transaction.
    try {
      const uploaded = await uploadMediaToDrive(
        qrId,
        photoFile ? { buffer: photoFile.buffer, mimetype: photoFile.mimetype } : undefined,
        videoFile ? { buffer: videoFile.buffer, mimetype: videoFile.mimetype } : undefined,
      )

      await qrRef(qrId).update({
        status: 'content_added',
        pendingSince: null,
        fromName,
        toName,
        message,
        photoUrl: uploaded.photo?.url ?? null,
        photoDriveId: uploaded.photo?.fileId ?? null,
        videoUrl: uploaded.video?.url ?? null,
        videoDriveId: uploaded.video?.fileId ?? null,
        mediaType: computeMediaType({ photoUrl: uploaded.photo?.url ?? null, videoUrl: uploaded.video?.url ?? null }),
        updatedAt: now(),
      })

      res.json({ status: 'content_added' })
    } catch {
      // Release the claim so the QR remains usable.
      await qrRef(qrId)
        .update({ status: 'empty', pendingSince: null, updatedAt: now() })
        .catch(() => undefined)
      friendlyError(res, 502, 'Something went wrong while saving your memory. Please try again.', 'UPLOAD_FAILED')
    }
  },
)

export default router
