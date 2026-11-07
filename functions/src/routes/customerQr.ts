import { Router } from 'express'
import { db } from '../services/firebaseAdmin'
import { config } from '../config'
import { memoryFieldsSchema } from '../utils/validation'
import { MediaValidationError } from '../utils/media'
import { mintUploadUrl, signedDownloadUrl, storagePathFor, ensureBucketCors, deleteFile as deleteStorageFile } from '../services/storageService'
import { computeMediaType, qrRef, now, resolvePublicQrId, validateAndPublishStorageUpload } from '../services/memoryService'
import { generatePinSalt, hashPin, verifyPinHash } from '../services/pinAuth'
import { pinSchema } from '../utils/validation'
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

// videoDownloadUrl/audioDownloadUrl are only populated for Storage-backed content
// (videoStoragePath/audioStoragePath set) — legacy Drive-backed memories keep using
// the driveId-based proxy download the client already has (see MemoryView.tsx).
async function memoryContentPayload(d: QrDoc) {
  const [videoDownloadUrl, audioDownloadUrl] = await Promise.all([
    d.videoStoragePath ? signedDownloadUrl(d.videoStoragePath, 'memory-video.mp4') : Promise.resolve(null),
    d.audioStoragePath ? signedDownloadUrl(d.audioStoragePath, 'voice-message.wav') : Promise.resolve(null),
  ])
  return {
    status: 'content_added' as const,
    fromName: d.fromName,
    toName: d.toName,
    message: d.message,
    photoUrl: d.photoUrl,
    photoDriveId: d.photoDriveId,
    videoUrl: d.videoUrl,
    videoDriveId: d.videoDriveId,
    videoDownloadUrl,
    audioUrl: d.audioUrl,
    audioDriveId: d.audioDriveId,
    audioDownloadUrl,
  }
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

      // Privacy controls the uploader chose at save time (see finalize below) —
      // checked against the view that's about to happen, before it's counted. Uses
      // viewCount (views of THIS saved memory, reset at finalize), not scanCount
      // (the QR's lifetime total including the uploader's own pre-save visits) —
      // otherwise a limit set to e.g. 5 could already be half-consumed by the time
      // the uploader finishes checking on the QR and actually saves it.
      let gated: 'expired' | 'scan_limit_reached' | 'pin_required' | null = null
      if (data.status === 'content_added') {
        if (data.expiresAt != null && nowMs > data.expiresAt) {
          gated = 'expired'
        } else if (data.maxScans != null && (data.viewCount ?? 0) >= data.maxScans) {
          gated = 'scan_limit_reached'
        } else if (data.pinHash) {
          // Reaching the PIN prompt isn't a view of the actual content yet — the real
          // view (and its viewCount increment) happens on a correct POST .../verify-pin.
          gated = 'pin_required'
        }
      }

      if (data.status !== 'disabled') {
        const update: Record<string, unknown> = { scanCount: (data.scanCount ?? 0) + 1, lastScannedAt: nowMs }
        if (data.status === 'content_added' && !gated) update.viewCount = (data.viewCount ?? 0) + 1
        tx.update(qrRef(qrId), update)
      }

      if (gated) return { status: gated }
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
    if (result.status === 'expired') {
      res.json({ status: 'expired' })
      return
    }
    if (result.status === 'scan_limit_reached') {
      res.json({ status: 'scan_limit_reached' })
      return
    }
    if (result.status === 'pin_required') {
      res.json({ status: 'pin_required' })
      return
    }
    if (result.status === 'pending_upload') {
      res.json({ status: 'pending_upload' })
      return
    }
    if (result.status === 'content_added') {
      res.json(await memoryContentPayload(result.data!))
      return
    }
    res.json({ status: 'empty', isTest: result.data?.isTest ?? false })
  } catch (err) {
    console.error('GET /:qrId failed', err)
    friendlyError(res, 500, 'Something went wrong. Please try again.', 'INTERNAL')
  }
})

// Unlocks a PIN-gated memory. Only this attempt (not merely landing on the PIN
// prompt) counts as a view, and wrong guesses are throttled — a 4-digit PIN only
// has 10,000 combinations, so without a lockout it's trivially brute-forceable.
router.post('/:token/verify-pin', async (req, res) => {
  const qrId = await resolvePublicQrId(req.params.token)
  if (!qrId) {
    res.json({ status: 'not_found' })
    return
  }

  const parsed = pinSchema.safeParse(req.body?.pin)
  if (!parsed.success) {
    friendlyError(res, 400, 'Please enter a 4-digit PIN.', 'INVALID_PIN')
    return
  }
  const pin = parsed.data

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(qrRef(qrId))
      if (!snap.exists) return { outcome: 'not_found' as const }

      const data = snap.data() as QrDoc
      const nowMs = now()

      if (data.status !== 'content_added') return { outcome: 'not_found' as const }
      if (data.expiresAt != null && nowMs > data.expiresAt) return { outcome: 'expired' as const }
      if (data.maxScans != null && (data.viewCount ?? 0) >= data.maxScans) return { outcome: 'scan_limit_reached' as const }
      if (!data.pinHash || !data.pinSalt) return { outcome: 'not_found' as const }

      if (data.pinLockedUntil != null && nowMs < data.pinLockedUntil) {
        return { outcome: 'locked' as const }
      }

      if (!verifyPinHash(pin, data.pinSalt, data.pinHash)) {
        const attempts = (data.pinFailedAttempts ?? 0) + 1
        const lockedOut = attempts >= config.limits.maxPinAttempts
        tx.update(qrRef(qrId), {
          pinFailedAttempts: lockedOut ? 0 : attempts,
          pinLockedUntil: lockedOut ? nowMs + config.limits.pinLockoutMs : null,
        })
        return { outcome: lockedOut ? ('locked' as const) : ('wrong' as const) }
      }

      tx.update(qrRef(qrId), {
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        viewCount: (data.viewCount ?? 0) + 1,
        lastScannedAt: nowMs,
      })
      return { outcome: 'ok' as const, data }
    })

    if (result.outcome === 'not_found') {
      res.json({ status: 'not_found' })
      return
    }
    if (result.outcome === 'expired') {
      res.json({ status: 'expired' })
      return
    }
    if (result.outcome === 'scan_limit_reached') {
      res.json({ status: 'scan_limit_reached' })
      return
    }
    if (result.outcome === 'locked') {
      friendlyError(res, 429, 'Too many incorrect attempts. Please try again later.', 'PIN_LOCKED')
      return
    }
    if (result.outcome === 'wrong') {
      friendlyError(res, 401, 'Incorrect PIN. Please try again.', 'WRONG_PIN')
      return
    }
    res.json(await memoryContentPayload(result.data!))
  } catch (err) {
    console.error('verify-pin failed', err)
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

// Step 1: claim the QR (same concurrency-safety as before) and hand back a short-lived,
// per-file signed URL the browser can PUT bytes straight to in Firebase Storage —
// the file never passes through this server (same reason Drive worked this way:
// serverless hosts cap request body size well below a real photo/video/voice file).
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
    await ensureBucketCors()
    const photoPath = wantsPhoto ? storagePathFor(qrId, 'photo') : undefined
    const videoPath = wantsVideo ? storagePathFor(qrId, 'video') : undefined
    const audioPath = wantsAudio ? storagePathFor(qrId, 'audio') : undefined
    const [photoUploadUrl, videoUploadUrl, audioUploadUrl] = await Promise.all([
      photoPath ? mintUploadUrl(photoPath) : Promise.resolve(undefined),
      videoPath ? mintUploadUrl(videoPath) : Promise.resolve(undefined),
      audioPath ? mintUploadUrl(audioPath) : Promise.resolve(undefined),
    ])
    res.json({ photoPath, photoUploadUrl, videoPath, videoUploadUrl, audioPath, audioUploadUrl })
  } catch (err) {
    console.error('upload-init failed', err)
    await qrRef(qrId).update({ status: 'empty', pendingSince: null, updatedAt: now() }).catch(() => undefined)
    friendlyError(res, 502, 'Something went wrong while preparing your upload. Please try again.', 'UPLOAD_INIT_FAILED')
  }
})

// Step 2: the browser has already uploaded bytes straight to Firebase Storage by this
// point — this re-validates what actually landed there (mirrors the checks a bypassed
// browser UI could otherwise skip), publishes a public link, and finalizes the Firestore
// record.
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

  const photoPath = typeof req.body?.photoPath === 'string' ? req.body.photoPath : undefined
  const videoPath = typeof req.body?.videoPath === 'string' ? req.body.videoPath : undefined
  const audioPath = typeof req.body?.audioPath === 'string' ? req.body.audioPath : undefined
  const fromName = fields.data.fromName?.trim() || null
  const toName = fields.data.toName?.trim() || null
  const message = fields.data.message?.trim() || null
  const expiresAt = fields.data.expiresInDays ? now() + fields.data.expiresInDays * 24 * 60 * 60 * 1000 : null
  const maxScans = fields.data.maxScans ?? null
  const pinSalt = fields.data.pin ? generatePinSalt() : null
  const pinHash = fields.data.pin && pinSalt ? hashPin(fields.data.pin, pinSalt) : null

  if (!photoPath && !videoPath && !audioPath && !message) {
    friendlyError(res, 400, 'Please add a photo, video, voice message, or message before saving.', 'EMPTY_MEMORY')
    return
  }

  const uploadedPaths: string[] = []
  try {
    let photoUrl: string | null = null
    let videoUrl: string | null = null
    let audioUrl: string | null = null

    if (photoPath) {
      ;({ url: photoUrl } = await validateAndPublishStorageUpload(qrId, 'photo', photoPath))
      uploadedPaths.push(photoPath)
    }
    if (videoPath) {
      ;({ url: videoUrl } = await validateAndPublishStorageUpload(qrId, 'video', videoPath))
      uploadedPaths.push(videoPath)
    }
    if (audioPath) {
      ;({ url: audioUrl } = await validateAndPublishStorageUpload(qrId, 'audio', audioPath))
      uploadedPaths.push(audioPath)
    }

    await qrRef(qrId).update({
      status: 'content_added',
      pendingSince: null,
      fromName,
      toName,
      message,
      photoUrl,
      photoDriveId: null,
      photoStoragePath: photoPath ?? null,
      videoUrl,
      videoDriveId: null,
      videoStoragePath: videoPath ?? null,
      audioUrl,
      audioDriveId: null,
      audioStoragePath: audioPath ?? null,
      expiresAt,
      maxScans,
      viewCount: 0,
      pinHash,
      pinSalt,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
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
      uploadedPaths.map((path) => deleteStorageFile(path).catch((e) => console.error(`Failed to delete storage file ${path}`, e))),
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
