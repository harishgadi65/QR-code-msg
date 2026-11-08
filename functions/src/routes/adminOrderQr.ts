import { Router } from 'express'
import { db } from '../services/firebaseAdmin'
import { generatePublicToken } from '../services/idAllocator'
import { now } from '../services/memoryService'
import type { OrderQrDoc, OrderSubmissionDoc } from '../types/orderQr'

const router = Router()

// There is only ever one of these — the single QR printed on chocolate boxes
// sold online (see routes/orderQr.ts) — so this doc id is a fixed constant
// rather than something generated per request.
const ORDER_QR_ID = 'ONLINE-ORDER-QR'

function orderQrRef() {
  return db.collection('orderQrCodes').doc(ORDER_QR_ID)
}

// Creates the shared QR's own record the first time this tab is opened, then
// just hands back the existing one on every later visit — same publicToken
// forever, since reprinting it would orphan every box already sold with the
// old code.
router.get('/', async (_req, res) => {
  const ref = orderQrRef()
  const snap = await ref.get()
  if (snap.exists) {
    res.json(snap.data() as OrderQrDoc)
    return
  }
  const doc: OrderQrDoc = { qrId: ORDER_QR_ID, publicToken: generatePublicToken(), createdAt: now() }
  await ref.set(doc)
  res.json(doc)
})

// Filtered/sorted in code rather than via .where+.orderBy — that combination
// needs a composite Firestore index, and this collection is small enough
// (one admin dashboard list, not a hot path) that it's not worth provisioning one.
router.get('/submissions', async (_req, res) => {
  const snap = await db.collection('orderQrSubmissions').get()
  const items = snap.docs
    .map((d) => d.data() as OrderSubmissionDoc)
    .filter((d) => d.status === 'content_added')
    .sort((a, b) => b.createdAt - a.createdAt)
  res.json({ items })
})

export default router
