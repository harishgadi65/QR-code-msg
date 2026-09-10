import { Router } from 'express'
import { db } from '../services/firebaseAdmin'
import { config } from '../config'
import { memoryFieldsSchema } from '../utils/validation'
import { MediaValidationError } from '../utils/media'
import { mintUploadAccessToken } from '../googleDrive/driveClient'
import { deleteFile, ensureQrFolder } from '../googleDrive/driveService'
import { computeMediaType, qrRef, now, resolvePublicQrId, validateAndPublishDriveUpload } from '../services/memoryService'
import { requireSignedIn, type AuthedRequest } from '../middleware/auth'
import type { QrDoc } from '../types/qr'
import type { Response, NextFunction } from 'express'

const router = Router()

// Wraps requireSignedIn behind the config flag so the sign-in requirement can be
// switched on later (once Google sign-in is enabled in Firebase) without touching
// route wiring — see config.requireUploadSignIn.
function maybeRequireSignedIn(req: AuthedRequest, res: Response, next: NextFunction) {
  if (config.requireUploadSignIn) return requireSignedIn(req, res, next)
  next()
}

function friendlyError(res: import('express').Response, status: number, message: string, code?: string) {
  res.status(status).json({ error: message, code })
}

router.get('/:token', async (req, res) => {
  const qrId = await resolvePublicQrId(req.params.token)
  if (!qrId) {
    // "not found" is a normal page state for the customer view, not an HTTP-level
    // error, so it's always a 200 body with a status field — same as empty/disabled/etc.
    res.json({ status: 'not_found' })
    return
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(qrRef(qrId))
      if (!snap.exists) return { status: 'not_found' as const }

      const data = snap.data() as QrDoc
      const nowMs = now()

      // Auto-recover a claim that was abandoned mid-upload (e.g. the browser tab closed).
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
    if (result.status === 'archived') {
      res.json({ status: 'archived' })
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
        photoDriveId: d.photoDriveId,
        videoUrl: d.videoUrl,
        videoDriveId: d.videoDriveId,
        audioUrl: d.audioUrl,
        audioDriveId: d.audioDriveId,
      })
      return
    }
    res.json({ status: 'empty', isTest: result.data?.isTest ?? false })
  } catch (err) {
    console.error('GET /:qrId failed', err)
    friendlyError(res, 500, 'Something went wrong. Please try again.', 'INTERNAL')
  }
})

const CLAIM_ERROR_MESSAGES: Record<string, string> = {
  not_found: 'This QR code is not registered.',
  disabled: 'This QR code is currently unavailable.',
  archived: 'This QR code is currently unavailable.',
  already_added: 'This QR code already has a saved memory.',
  in_progress: 'Someone is already saving a memory to this QR. Please try again shortly.',
}

async function claimQr(qrId: string) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(qrRef(qrId))
    if (!snap.exists) return { ok: false as const, reason: 'not_found' as const }
    const data = snap.data() as QrDoc

    if (data.status === 'disabled') return { ok: false as const, reason: 'disabled' as const }
    if (data.status === 'archived') return { ok: false as const, reason: 'archived' as const }
    if (data.status === 'content_added') return { ok: false as const, reason: 'already_added' as const }
    if (data.status === 'pending_upload') {
      const timedOut = data.pendingSince != null && now() - data.pendingSince > config.limits.pendingUploadTimeoutMs
      if (!timedOut) return { ok: false as const, reason: 'in_progress' as const }
    }

    tx.update(qrRef(qrId), { status: 'pending_upload', pendingSince: now(), updatedAt: now() })
    return { ok: true as const }
  })
}

// Step 1: claim the QR (same concurrency-safety as before) and hand back a short-lived
// Drive access token plus the exact folder(s) the browser is allowed to upload into —
// the browser then uploads the file bytes straight to Google, never through this server.
router.post('/:token/upload-init', maybeRequireSignedIn, async (req, res) => {
  const qrId = await resolvePublicQrId(req.params.token)
  if (!qrId) {
    friendlyError(res, 404, 'This QR code is not registered.', 'NOT_FOUND')
    return
  }
  const wantsPhoto = Boolean(req.body?.wantsPhoto)
  const wantsVideo = Boolean(req.body?.wantsVideo)
  const wantsAudio = Boolean(req.body?.wantsAudio)

  const claim = await claimQr(qrId)
  if (!claim.ok) {
    friendlyError(res, 409, CLAIM_ERROR_MESSAGES[claim.reason], claim.reason.toUpperCase())
    return
  }

  try {
    const needsDrive = wantsPhoto || wantsVideo || wantsAudio
    const [accessToken, photoFolderId, videoFolderId, audioFolderId] = await Promise.all([
      needsDrive ? mintUploadAccessToken() : Promise.resolve(undefined),
      wantsPhoto ? ensureQrFolder(qrId, 'photo') : Promise.resolve(undefined),
      wantsVideo ? ensureQrFolder(qrId, 'video') : Promise.resolve(undefined),
      wantsAudio ? ensureQrFolder(qrId, 'audio') : Promise.resolve(undefined),
    ])
    res.json({ accessToken, photoFolderId, videoFolderId, audioFolderId })
  } catch {
    await qrRef(qrId).update({ status: 'empty', pendingSince: null, updatedAt: now() }).catch(() => undefined)
    friendlyError(res, 502, 'Something went wrong while preparing your upload. Please try again.', 'UPLOAD_INIT_FAILED')
  }
})

// Step 2: the browser has already uploaded bytes straight to Drive by this point — this
// re-validates what actually landed there (mirrors the checks a bypassed browser UI
// could otherwise skip), sets sharing permissions, and finalizes the Firestore record.
router.post('/:token/finalize', maybeRequireSignedIn, async (req: AuthedRequest, res) => {
  const qrId = await resolvePublicQrId(req.params.token)
  if (!qrId) {
    friendlyError(res, 404, 'This QR code is not registered.', 'NOT_FOUND')
    return
  }

  const fields = memoryFieldsSchema.safeParse(req.body)
  if (!fields.success) {
    friendlyError(res, 400, 'Please check the details you entered.', 'INVALID_FIELDS')
    return
  }

  const snap = await qrRef(qrId).get()
  if (!snap.exists) {
    friendlyError(res, 404, 'This QR code is not registered.', 'NOT_FOUND')
    return
  }
  if ((snap.data() as QrDoc).status !== 'pending_upload') {
    friendlyError(res, 409, 'Please start over from the upload step.', 'NOT_PENDING')
    return
  }

  const photoDriveId = typeof req.body?.photoDriveId === 'string' ? req.body.photoDriveId : undefined
  const videoDriveId = typeof req.body?.videoDriveId === 'string' ? req.body.videoDriveId : undefined
  const audioDriveId = typeof req.body?.audioDriveId === 'string' ? req.body.audioDriveId : undefined
  const fromName = fields.data.fromName?.trim() || null
  const toName = fields.data.toName?.trim() || null
  const message = fields.data.message?.trim() || null

  if (!photoDriveId && !videoDriveId && !audioDriveId && !message) {
    friendlyError(res, 400, 'Please add a photo, video, voice message, or message before saving.', 'EMPTY_MEMORY')
    return
  }

  const uploadedFileIds: string[] = []
  try {
    let photoUrl: string | null = null
    let videoUrl: string | null = null
    let audioUrl: string | null = null

    if (photoDriveId) {
      ;({ url: photoUrl } = await validateAndPublishDriveUpload(qrId, 'photo', photoDriveId))
      uploadedFileIds.push(photoDriveId)
    }
    if (videoDriveId) {
      ;({ url: videoUrl } = await validateAndPublishDriveUpload(qrId, 'video', videoDriveId))
      uploadedFileIds.push(videoDriveId)
    }
    if (audioDriveId) {
      ;({ url: audioUrl } = await validateAndPublishDriveUpload(qrId, 'audio', audioDriveId))
      uploadedFileIds.push(audioDriveId)
    }

    await qrRef(qrId).update({
      status: 'content_added',
      pendingSince: null,
      fromName,
      toName,
      message,
      photoUrl,
      photoDriveId: photoDriveId ?? null,
      videoUrl,
      videoDriveId: videoDriveId ?? null,
      audioUrl,
      audioDriveId: audioDriveId ?? null,
      uploaderEmail: req.email ?? null,
      uploaderName: req.name ?? null,
      mediaType: computeMediaType({ photoUrl, videoUrl }),
      updatedAt: now(),
    })

    res.json({ status: 'content_added' })
  } catch (err) {
    console.error('finalize failed', err)
    // Clean up whatever was uploaded and release the claim so the QR stays usable.
    await Promise.all(
      uploadedFileIds.map((id) => deleteFile(id).catch((e) => console.error(`Failed to delete Drive file ${id}`, e))),
    )
    await qrRef(qrId).update({ status: 'empty', pendingSince: null, updatedAt: now() }).catch(() => undefined)

    if (err instanceof MediaValidationError) {
      friendlyError(res, 400, err.message, err.code)
      return
    }
    friendlyError(res, 502, 'Something went wrong while saving your memory. Please try again.', 'UPLOAD_FAILED')
  }
})

// Lets the browser release its own claim early (e.g. its direct Drive upload failed)
// instead of waiting out the full pending-upload timeout before the QR is usable again.
router.post('/:token/cancel-upload', async (req, res) => {
  const qrId = await resolvePublicQrId(req.params.token)
  if (!qrId) {
    res.json({ ok: true })
    return
  }

  const snap = await qrRef(qrId).get()
  if (snap.exists && (snap.data() as QrDoc).status === 'pending_upload') {
    await qrRef(qrId).update({ status: 'empty', pendingSince: null, updatedAt: now() })
  }
  res.json({ ok: true })
})

export default router
