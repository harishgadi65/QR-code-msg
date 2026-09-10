/**
 * One-time backfill: assigns a random publicToken to every QR code that doesn't
 * have one yet — i.e. every QR generated before that field existed. See
 * services/idAllocator.ts's generatePublicToken() and services/memoryService.ts's
 * resolvePublicQrId() for why this exists: the sequential QR-NNNNNN id used to
 * double as the public URL, which let anyone enumerate other people's memories
 * by guessing nearby numbers. Already-printed physical QR codes still work via
 * their old QR-NNNNNN link (resolvePublicQrId keeps accepting that shape), but
 * this gives every existing record a secure token too, so re-downloading or
 * reprinting an old QR's image from the admin panel now produces the safer link.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json npx ts-node scripts/backfillPublicTokens.ts
 */
import { randomBytes } from 'node:crypto'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Inlined rather than imported from services/idAllocator.ts, since that module
// pulls in services/firebaseAdmin.ts as a side effect, which self-initializes
// the default Firebase app on import and would conflict with the
// initializeApp() call below.
function generatePublicToken(): string {
  return randomBytes(16).toString('hex')
}

const CHUNK_SIZE = 450

async function main() {
  initializeApp({ credential: applicationDefault() })
  const db = getFirestore()

  const snap = await db.collection('qrCodes').get()
  const missingToken = snap.docs.filter((doc) => !doc.data().publicToken)
  console.log(`Found ${missingToken.length} QR codes without a publicToken (of ${snap.size} total)`)

  let updated = 0
  for (let i = 0; i < missingToken.length; i += CHUNK_SIZE) {
    const chunk = missingToken.slice(i, i + CHUNK_SIZE)
    const batch = db.batch()
    for (const doc of chunk) {
      batch.update(doc.ref, { publicToken: generatePublicToken() })
    }
    await batch.commit()
    updated += chunk.length
    console.log(`Updated ${updated}/${missingToken.length}`)
  }
  console.log(`Done. Updated ${updated}/${missingToken.length}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
