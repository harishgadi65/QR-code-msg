import { Router } from 'express'
import { AggregateField } from 'firebase-admin/firestore'
import { db } from '../services/firebaseAdmin'

const router = Router()

router.get('/', async (_req, res) => {
  const qrCodes = db.collection('qrCodes').where('isTest', '==', false)

  const [total, empty, contentAdded, disabled, photos, videos, batches, scans] = await Promise.all([
    qrCodes.count().get(),
    qrCodes.where('status', '==', 'empty').count().get(),
    qrCodes.where('status', '==', 'content_added').count().get(),
    qrCodes.where('status', '==', 'disabled').count().get(),
    qrCodes.where('mediaType', 'in', ['photo', 'photo_video']).count().get(),
    qrCodes.where('mediaType', 'in', ['video', 'photo_video']).count().get(),
    db.collection('batches').count().get(),
    qrCodes.aggregate({ totalScans: AggregateField.sum('scanCount') }).get(),
  ])

  res.json({
    totalQrCodes: total.data().count,
    empty: empty.data().count,
    contentAdded: contentAdded.data().count,
    disabled: disabled.data().count,
    totalPhotos: photos.data().count,
    totalVideos: videos.data().count,
    totalBatches: batches.data().count,
    totalScans: scans.data().totalScans ?? 0,
  })
})

export default router
