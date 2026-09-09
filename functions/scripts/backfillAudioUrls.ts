/**
 * One-time backfill: recomputes audioUrl for every QR that already has a saved
 * voice message, since the URL format changed from Drive's uc?export=download
 * (which <audio>/<iframe> playback couldn't reliably load, especially on iOS
 * Safari) to Drive's /preview embed — see googleDrive/driveService.ts's
 * urlForFile(). Only touches docs whose stored audioUrl is stale.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json npx ts-node scripts/backfillAudioUrls.ts
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { urlForFile } from '../src/googleDrive/driveService'

async function main() {
  initializeApp({ credential: applicationDefault() })
  const db = getFirestore()

  const snap = await db.collection('qrCodes').get()
  const withAudio = snap.docs.filter((doc) => doc.data().audioDriveId)
  console.log(`Found ${withAudio.length} QR codes with a saved voice message (of ${snap.size} total)`)

  let updated = 0
  for (const doc of withAudio) {
    const data = doc.data()
    const newUrl = urlForFile(data.audioDriveId as string, 'audio')
    if (data.audioUrl !== newUrl) {
      await doc.ref.update({ audioUrl: newUrl })
      updated++
      console.log(`Updated ${doc.id}: ${data.audioUrl} -> ${newUrl}`)
    }
  }
  console.log(`Done. Updated ${updated}/${withAudio.length}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
