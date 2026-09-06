import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firebaseAdmin'
import {
  assertFileInFolder,
  deleteFile,
  downloadFile,
  ensureQrFolder,
  makeFilePublic,
  urlForFile,
  type DriveMediaKind,
} from '../googleDrive/driveService'
import { validatePhoto, validateVideoUpload, assertVideoWithinDuration } from '../utils/media'
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
  } else {
    validateVideoUpload({ mimetype: meta.mimeType, size: meta.size })
    const buffer = await downloadFile(driveId)
    await assertVideoWithinDuration(buffer)
  }

  await makeFilePublic(driveId)
  return { url: urlForFile(driveId, kind) }
}

export async function deleteExistingContentFiles(doc: Partial<QrDoc>): Promise<void> {
  await Promise.all([
    doc.photoDriveId ? deleteFile(doc.photoDriveId).catch(() => undefined) : undefined,
    doc.videoDriveId ? deleteFile(doc.videoDriveId).catch(() => undefined) : undefined,
  ])
}

export function qrRef(qrId: string) {
  return db.collection('qrCodes').doc(qrId)
}

export const now = () => Date.now()
export const serverTimestamp = () => FieldValue.serverTimestamp()
