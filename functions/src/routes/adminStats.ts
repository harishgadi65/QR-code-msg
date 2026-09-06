import { Router } from 'express'
import { AggregateField } from 'firebase-admin/firestore'
import { db } from '../services/firebaseAdmin'

const router = Router()

router.get('/', async (_req, res) => {
  const qrCodes = db.collection('qrCodes').where('isTest', '==', false)

  const labeled = {
    total: qrCodes.count().get(),
    empty: qrCodes.where('status', '==', 'empty').count().get(),
    contentAdded: qrCodes.where('status', '==', 'content_added').count().get(),
    disabled: qrCodes.where('status', '==', 'disabled').count().get(),
    photos: qrCodes.where('mediaType', 'in', ['photo', 'photo_video']).count().get(),
    videos: qrCodes.where('mediaType', 'in', ['video', 'photo_video']).count().get(),
    batches: db.collection('batches').count().get(),
    scans: qrCodes.aggregate({ totalScans: AggregateField.sum('scanCount') }).get(),
  }

  // Each query is isolated with its own timeout so one missing index or slow query
  // degrades that single number instead of hanging the entire dashboard (which is
  // exactly what happened before: an unindexed sum() aggregate blocked every stat).
  const results: Record<string, unknown> = {}
  const withTimeout = <T>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms))])
  await Promise.all(
    Object.entries(labeled).map(async ([key, promise]) => {
      try {
        results[key] = await withTimeout(promise as Promise<unknown>, 8000)
      } catch (err) {
        console.error(`admin stats query "${key}" failed`, err)
      }
    }),
  )

  res.json({
    totalQrCodes: (results.total as any)?.data().count ?? null,
    empty: (results.empty as any)?.data().count ?? null,
    contentAdded: (results.contentAdded as any)?.data().count ?? null,
    disabled: (results.disabled as any)?.data().count ?? null,
    totalPhotos: (results.photos as any)?.data().count ?? null,
    totalVideos: (results.videos as any)?.data().count ?? null,
    totalBatches: (results.batches as any)?.data().count ?? null,
    totalScans: (results.scans as any)?.data().totalScans ?? null,
  })
})

export default router
