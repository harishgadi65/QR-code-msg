import { db } from './firebaseAdmin'

const COUNTERS_COLLECTION = 'counters'

async function allocateSequence(counterId: string, amount: number): Promise<number> {
  const ref = db.collection(COUNTERS_COLLECTION).doc(counterId)

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const last = (snap.data()?.lastNumber as number | undefined) ?? 0
    const next = last + amount
    tx.set(ref, { lastNumber: next }, { merge: true })
    return last
  })
}

export function formatQrId(n: number): string {
  return `QR-${String(n).padStart(6, '0')}`
}

export function formatBatchId(n: number): string {
  return `BATCH-${String(n).padStart(4, '0')}`
}

export async function allocateQrIds(quantity: number): Promise<string[]> {
  const startExclusive = await allocateSequence('qrCounter', quantity)
  const ids: string[] = []
  for (let i = 1; i <= quantity; i++) ids.push(formatQrId(startExclusive + i))
  return ids
}

export async function allocateBatchId(): Promise<string> {
  const startExclusive = await allocateSequence('batchCounter', 1)
  return formatBatchId(startExclusive + 1)
}
