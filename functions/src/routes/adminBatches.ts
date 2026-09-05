import { Router } from 'express'
import { db } from '../services/firebaseAdmin'

const router = Router()

router.get('/', async (req, res) => {
  const { cursor, limit } = req.query as Record<string, string | undefined>
  const pageSize = Math.min(Number(limit) || 50, 200)

  let query = db.collection('batches').orderBy('createdAt', 'desc').limit(pageSize)
  if (cursor) {
    const cursorSnap = await db.collection('batches').doc(cursor).get()
    if (cursorSnap.exists) query = query.startAfter(cursorSnap)
  }

  const snap = await query.get()
  res.json({
    items: snap.docs.map((d) => d.data()),
    nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null,
  })
})

router.get('/:batchId', async (req, res) => {
  const batchSnap = await db.collection('batches').doc(req.params.batchId).get()
  if (!batchSnap.exists) {
    res.status(404).json({ error: 'Batch not found.', code: 'NOT_FOUND' })
    return
  }

  const statuses = ['empty', 'content_added', 'disabled', 'archived', 'pending_upload'] as const
  const base = db.collection('qrCodes').where('batchId', '==', req.params.batchId)
  const results = await Promise.all(statuses.map((s) => base.where('status', '==', s).count().get()))
  const counts = Object.fromEntries(statuses.map((s, i) => [s, results[i].data().count]))

  res.json({ batch: batchSnap.data(), counts })
})

export default router
