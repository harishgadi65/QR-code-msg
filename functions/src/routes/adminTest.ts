import { Router } from 'express'
import { deleteExistingContentFiles, now, qrRef } from '../services/memoryService'
import { generatePublicToken } from '../services/idAllocator'
import type { QrDoc } from '../types/qr'

const router = Router()
export const TEST_QR_ID = 'TEST-QR-0001'

router.post('/ensure', async (_req, res) => {
  const ref = qrRef(TEST_QR_ID)
  const snap = await ref.get()
  if (!snap.exists) {
    const nowMs = now()
    const doc: QrDoc = {
      qrId: TEST_QR_ID,
      publicToken: generatePublicToken(),
      batchId: null,
      status: 'empty',
      isTest: true,
      fromName: null,
      toName: null,
      message: null,
      photoUrl: null,
      photoDriveId: null,
      videoUrl: null,
      videoDriveId: null,
      audioUrl: null,
      audioDriveId: null,
      scanCount: 0,
      lastScannedAt: null,
      pendingSince: null,
      createdAt: nowMs,
      updatedAt: nowMs,
    }
    await ref.set(doc)
  }
  res.json({ qrId: TEST_QR_ID })
})

router.post('/reset', async (_req, res) => {
  const ref = qrRef(TEST_QR_ID)
  const snap = await ref.get()
  if (snap.exists) {
    await deleteExistingContentFiles(snap.data() as QrDoc)
  }
  await ref.set(
    {
      status: 'empty',
      fromName: null,
      toName: null,
      message: null,
      photoUrl: null,
      photoDriveId: null,
      videoUrl: null,
      videoDriveId: null,
      audioUrl: null,
      audioDriveId: null,
      mediaType: 'none',
      pendingSince: null,
      updatedAt: now(),
    },
    { merge: true },
  )
  res.json({ ok: true })
})

export default router
