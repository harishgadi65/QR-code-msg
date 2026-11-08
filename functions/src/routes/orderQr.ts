import { Router } from 'express'
import { db } from '../services/firebaseAdmin'
import { config } from '../config'
import { orderMemoryFieldsSchema, pinSchema, phoneNumberSchema } from '../utils/validation'
import { MediaValidationError } from '../utils/media'
import {
  mintUploadUrl,
  signedDownloadUrl,
  orderSubmissionStoragePathFor,
  ensureBucketCors,
  deleteFile as deleteStorageFile,
} from '../services/storageService'
import { validateAndPublishOrderUpload, now } from '../services/memoryService'
import { requireSignedIn, type AuthedRequest } from '../middleware/auth'
import type { OrderSubmissionDoc } from '../types/orderQr'

const router = Router()

const SUBMISSIONS = 'orderQrSubmissions'
const LOCKOUTS = 'orderQrLookupLockouts'

function friendlyError(res: import('express').Response, status: number, message: string, code?: string) {
  res.status(status).json({ error: message, code })
}

function submissionRef(submissionId: string) {
  return db.collection(SUBMISSIONS).doc(submissionId)
}

async function resolveOrderQrToken(token: string): Promise<boolean> {
  const snap = await db.collection('orderQrCodes').where('publicToken', '==', token).limit(1).get()
  return !snap.empty
}

// Mirrors customerQr.ts's memoryContentPayload, for a submission instead of a
// per-gift QrDoc — same reason: videoDownloadUrl/audioDownloadUrl are signed
// fresh on every lookup rather than stored, so they can't go stale.
async function submissionPayload(d: OrderSubmissionDoc) {
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
    photoDriveId: null,
    videoUrl: d.videoUrl,
    videoDriveId: null,
    videoDownloadUrl,
    audioUrl: d.audioUrl,
    audioDriveId: null,
    audioDownloadUrl,
  }
}

// Every scan of the one shared QR lands here first just to confirm the token is
// still the real, currently-active one (and not an old/mistyped link) before the
// client shows the "Add a memory" / "View a memory" choice.
router.get('/:token/check', async (req, res) => {
  const ok = await resolveOrderQrToken(req.params.token)
  res.json({ ok })
})

// Step 1: claim nothing (unlike the per-gift QR, this one is reused by everyone,
// so there's no single doc to claim) — just create this buyer's own submission
// and hand back a short-lived signed upload URL per file, same direct-to-R2
// pattern as customerQr.ts.
router.post('/:token/upload-init', requireSignedIn, async (req: AuthedRequest, res) => {
  const ok = await resolveOrderQrToken(req.params.token)
  if (!ok) {
    friendlyError(res, 404, 'This QR code is not registered.', 'NOT_FOUND')
    return
  }

  const wantsPhoto = Boolean(req.body?.wantsPhoto)
  const wantsVideo = Boolean(req.body?.wantsVideo)
  const wantsAudio = Boolean(req.body?.wantsAudio)

  try {
    const nowMs = now()
    const ref = db.collection(SUBMISSIONS).doc()
    const doc: OrderSubmissionDoc = {
      submissionId: ref.id,
      status: 'pending_upload',
      uploaderEmail: req.email ?? null,
      uploaderName: req.name ?? null,
      fromName: null,
      toName: null,
      message: null,
      photoUrl: null,
      photoStoragePath: null,
      videoUrl: null,
      videoStoragePath: null,
      audioUrl: null,
      audioStoragePath: null,
      phoneNumber: null,
      pin: null,
      pendingSince: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    }
    await ref.set(doc)

    await ensureBucketCors()
    const photoPath = wantsPhoto ? orderSubmissionStoragePathFor(ref.id, 'photo') : undefined
    const videoPath = wantsVideo ? orderSubmissionStoragePathFor(ref.id, 'video') : undefined
    const audioPath = wantsAudio ? orderSubmissionStoragePathFor(ref.id, 'audio') : undefined
    const [photoUploadUrl, videoUploadUrl, audioUploadUrl] = await Promise.all([
      photoPath ? mintUploadUrl(photoPath) : Promise.resolve(undefined),
      videoPath ? mintUploadUrl(videoPath) : Promise.resolve(undefined),
      audioPath ? mintUploadUrl(audioPath) : Promise.resolve(undefined),
    ])
    res.json({ submissionId: ref.id, photoPath, photoUploadUrl, videoPath, videoUploadUrl, audioPath, audioUploadUrl })
  } catch (err) {
    console.error('order-qr upload-init failed', err)
    friendlyError(res, 502, 'Something went wrong while preparing your upload. Please try again.', 'UPLOAD_INIT_FAILED')
  }
})

router.post('/:token/:submissionId/finalize', requireSignedIn, async (req: AuthedRequest, res) => {
  const ok = await resolveOrderQrToken(req.params.token)
  if (!ok) {
    friendlyError(res, 404, 'This QR code is not registered.', 'NOT_FOUND')
    return
  }

  const ref = submissionRef(req.params.submissionId)
  const snap = await ref.get()
  if (!snap.exists) {
    friendlyError(res, 404, 'Please start over from the upload step.', 'NOT_FOUND')
    return
  }
  const existing = snap.data() as OrderSubmissionDoc
  if (existing.status !== 'pending_upload' || existing.uploaderEmail !== (req.email ?? null)) {
    friendlyError(res, 409, 'Please start over from the upload step.', 'NOT_PENDING')
    return
  }

  const fields = orderMemoryFieldsSchema.safeParse(req.body)
  if (!fields.success) {
    friendlyError(res, 400, 'Please check the details you entered.', 'INVALID_FIELDS')
    return
  }

  const photoPath = typeof req.body?.photoPath === 'string' ? req.body.photoPath : undefined
  const videoPath = typeof req.body?.videoPath === 'string' ? req.body.videoPath : undefined
  const audioPath = typeof req.body?.audioPath === 'string' ? req.body.audioPath : undefined
  const fromName = fields.data.fromName?.trim() || null
  const toName = fields.data.toName?.trim() || null
  const message = fields.data.message?.trim() || null

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
      ;({ url: photoUrl } = await validateAndPublishOrderUpload(ref.id, 'photo', photoPath))
      uploadedPaths.push(photoPath)
    }
    if (videoPath) {
      ;({ url: videoUrl } = await validateAndPublishOrderUpload(ref.id, 'video', videoPath))
      uploadedPaths.push(videoPath)
    }
    if (audioPath) {
      ;({ url: audioUrl } = await validateAndPublishOrderUpload(ref.id, 'audio', audioPath))
      uploadedPaths.push(audioPath)
    }

    await ref.update({
      status: 'content_added',
      pendingSince: null,
      fromName,
      toName,
      message,
      photoUrl,
      photoStoragePath: photoPath ?? null,
      videoUrl,
      videoStoragePath: videoPath ?? null,
      audioUrl,
      audioStoragePath: audioPath ?? null,
      phoneNumber: fields.data.phoneNumber,
      pin: fields.data.pin,
      updatedAt: now(),
    })

    res.json({ status: 'content_added' })
  } catch (err) {
    console.error('order-qr finalize failed', err)
    await Promise.all(
      uploadedPaths.map((path) => deleteStorageFile(path).catch((e) => console.error(`Failed to delete storage file ${path}`, e))),
    )
    await ref.delete().catch(() => undefined)

    if (err instanceof MediaValidationError) {
      friendlyError(res, 400, err.message, err.code)
      return
    }
    friendlyError(res, 502, 'Something went wrong while saving your memory. Please try again.', 'UPLOAD_FAILED')
  }
})

router.post('/:token/:submissionId/cancel-upload', async (req, res) => {
  const ref = submissionRef(req.params.submissionId)
  const snap = await ref.get()
  if (snap.exists && (snap.data() as OrderSubmissionDoc).status === 'pending_upload') {
    await ref.delete()
  }
  res.json({ ok: true })
})

// Lets whoever received the chocolate look their specific submission back up by
// the phone number + PIN its sender chose — no Google sign-in needed here, since
// the receiver never created an account. Throttled per phone number (not per
// submission) since that's the value an attacker actually controls when guessing.
router.post('/:token/lookup', async (req, res) => {
  const ok = await resolveOrderQrToken(req.params.token)
  if (!ok) {
    friendlyError(res, 404, 'This QR code is not registered.', 'NOT_FOUND')
    return
  }

  const phoneParsed = phoneNumberSchema.safeParse(req.body?.phoneNumber)
  const pinParsed = pinSchema.safeParse(req.body?.pin)
  if (!phoneParsed.success || !pinParsed.success) {
    friendlyError(res, 400, 'Please enter a valid phone number and 4-digit PIN.', 'INVALID_FIELDS')
    return
  }
  const phoneNumber = phoneParsed.data
  const pin = pinParsed.data
  const lockoutRef = db.collection(LOCKOUTS).doc(phoneNumber)

  try {
    const nowMs = now()
    const lockoutSnap = await lockoutRef.get()
    const lockout = lockoutSnap.data() as { failedAttempts?: number; lockedUntil?: number } | undefined
    if (lockout?.lockedUntil != null && nowMs < lockout.lockedUntil) {
      friendlyError(res, 429, 'Too many incorrect attempts. Please try again later.', 'LOOKUP_LOCKED')
      return
    }

    const matches = await db.collection(SUBMISSIONS).where('phoneNumber', '==', phoneNumber).get()
    const found = matches.docs
      .map((d) => d.data() as OrderSubmissionDoc)
      .find((d) => d.status === 'content_added' && d.pin === pin)

    if (!found) {
      const attempts = (lockout?.failedAttempts ?? 0) + 1
      const lockedOut = attempts >= config.limits.maxPinAttempts
      await lockoutRef.set(
        {
          failedAttempts: lockedOut ? 0 : attempts,
          lockedUntil: lockedOut ? nowMs + config.limits.pinLockoutMs : null,
        },
        { merge: true },
      )
      if (lockedOut) {
        friendlyError(res, 429, 'Too many incorrect attempts. Please try again later.', 'LOOKUP_LOCKED')
      } else {
        friendlyError(res, 404, 'No memory found for that phone number and PIN.', 'LOOKUP_NOT_FOUND')
      }
      return
    }

    await lockoutRef.set({ failedAttempts: 0, lockedUntil: null }, { merge: true })
    res.json(await submissionPayload(found))
  } catch (err) {
    console.error('order-qr lookup failed', err)
    friendlyError(res, 500, 'Something went wrong. Please try again.', 'INTERNAL')
  }
})

export default router
