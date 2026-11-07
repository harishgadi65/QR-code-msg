import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firebaseAdmin'
import {
  assertFileInFolder,
  deleteFile as deleteDriveFile,
  ensureQrFolder,
  makeFilePublic,
  urlForFile,
  type DriveMediaKind,
} from '../googleDrive/driveService'
import { downloadFile as downloadDriveFile } from '../googleDrive/driveService'
import {
  deleteFile as deleteStorageFile,
  downloadFile as downloadStorageFile,
  getFileMetadata as getStorageFileMetadata,
  publishFile as publishStorageFile,
  type StorageMediaKind,
} from './storageService'
import {
  validatePhoto,
  validateVideoUpload,
  validateAudioUpload,
  assertVideoWithinDuration,
  assertAudioWithinDuration,
} from '../utils/media'
import { qrIdSchema, publicTokenSchema } from '../utils/validation'
import type { QrDoc } from '../types/qr'

export type MediaType = 'none' | 'photo' | 'video' | 'photo_video'

export function computeMediaType(doc: Pick<QrDoc, 'photoUrl' | 'videoUrl'>): MediaType {
  if (doc.photoUrl && doc.videoUrl) return 'photo_video'
  if (doc.videoUrl) return 'video'
  if (doc.photoUrl) return 'photo'
  return 'none'
}

/**
 * Re-validates a file the browser already uploaded directly to Drive (mirroring the
 * checks that would otherwise only exist in the browser UI, which a direct API call
 * could bypass), then makes it publicly viewable. Used by both the customer save flow
 * and the admin replace-photo/replace-video flow — same trust boundary either way,
 * since both let an external browser hold a temporary Drive upload token.
 */
export async function validateAndPublishDriveUpload(
  qrId: string,
  kind: DriveMediaKind,
  driveId: string,
): Promise<{ url: string }> {
  const folderId = await ensureQrFolder(qrId, kind)
  const meta = await assertFileInFolder(driveId, folderId)

  if (kind === 'photo') {
    validatePhoto({ mimetype: meta.mimeType, size: meta.size })
  } else if (kind === 'video') {
    validateVideoUpload({ mimetype: meta.mimeType, size: meta.size })
    const buffer = await downloadDriveFile(driveId)
    await assertVideoWithinDuration(buffer)
  } else {
    validateAudioUpload({ mimetype: meta.mimeType, size: meta.size })
    const buffer = await downloadDriveFile(driveId)
    await assertAudioWithinDuration(buffer)
  }

  await makeFilePublic(driveId)
  return { url: urlForFile(driveId, kind) }
}

/**
 * Firebase Storage equivalent of validateAndPublishDriveUpload, used by every new
 * save going forward (see routes/customerQr.ts's finalize) — Drive is kept only to
 * serve memories that were already saved there before this moved. Unlike Drive's
 * access-token model, a GCS v4 signed URL cryptographically authorizes a PUT to
 * exactly the one path it was minted for, so there's no equivalent of Drive's
 * "point an unrelated existing file at this QR" risk to guard against — the prefix
 * check below is just defense-in-depth against a malformed/mismatched path.
 */
export async function validateAndPublishStorageUpload(
  qrId: string,
  kind: StorageMediaKind,
  path: string,
): Promise<{ url: string }> {
  if (!path.startsWith(`qr-memories/${qrId}/${kind}/`)) {
    throw new Error('File does not belong to the expected upload path')
  }
  const meta = await getStorageFileMetadata(path)

  if (kind === 'photo') {
    validatePhoto({ mimetype: meta.contentType, size: meta.size })
  } else if (kind === 'video') {
    validateVideoUpload({ mimetype: meta.contentType, size: meta.size })
    const buffer = await downloadStorageFile(path)
    await assertVideoWithinDuration(buffer)
  } else {
    validateAudioUpload({ mimetype: meta.contentType, size: meta.size })
    const buffer = await downloadStorageFile(path)
    await assertAudioWithinDuration(buffer)
  }

  const url = await publishStorageFile(path)
  return { url }
}

export async function deleteExistingContentFiles(doc: Partial<QrDoc>): Promise<void> {
  await Promise.all([
    doc.photoDriveId
      ? deleteDriveFile(doc.photoDriveId).catch((err) => console.error(`Failed to delete Drive file ${doc.photoDriveId}`, err))
      : doc.photoStoragePath
        ? deleteStorageFile(doc.photoStoragePath).catch((err) => console.error(`Failed to delete storage file ${doc.photoStoragePath}`, err))
        : undefined,
    doc.videoDriveId
      ? deleteDriveFile(doc.videoDriveId).catch((err) => console.error(`Failed to delete Drive file ${doc.videoDriveId}`, err))
      : doc.videoStoragePath
        ? deleteStorageFile(doc.videoStoragePath).catch((err) => console.error(`Failed to delete storage file ${doc.videoStoragePath}`, err))
        : undefined,
    doc.audioDriveId
      ? deleteDriveFile(doc.audioDriveId).catch((err) => console.error(`Failed to delete Drive file ${doc.audioDriveId}`, err))
      : doc.audioStoragePath
        ? deleteStorageFile(doc.audioStoragePath).catch((err) => console.error(`Failed to delete storage file ${doc.audioStoragePath}`, err))
        : undefined,
  ])
}

export function qrRef(qrId: string) {
  return db.collection('qrCodes').doc(qrId)
}

/**
 * Turns whatever the customer-facing /m/:param URL segment holds into the real
 * qrId (Firestore doc id) to operate on, or null if it doesn't resolve to anything.
 * Accepts two shapes: a legacy QR-NNNNNN/TEST-QR-#### id (already-printed QR codes
 * from before publicToken existed — those keep working exactly as before), or a
 * publicToken (every QR generated from now on), resolved with a field query since
 * the token is deliberately not the doc id itself.
 */
export async function resolvePublicQrId(param: string): Promise<string | null> {
  if (qrIdSchema.safeParse(param).success) return param

  if (!publicTokenSchema.safeParse(param).success) return null
  const snap = await db.collection('qrCodes').where('publicToken', '==', param).limit(1).get()
  return snap.empty ? null : snap.docs[0].id
}

export const now = () => Date.now()
export const serverTimestamp = () => FieldValue.serverTimestamp()
