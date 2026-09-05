import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firebaseAdmin'
import { deleteFile, ensureQrFolder, uploadFile } from '../googleDrive/driveService'
import type { QrDoc } from '../types/qr'

export type MediaType = 'none' | 'photo' | 'video' | 'photo_video'

export function computeMediaType(doc: Pick<QrDoc, 'photoUrl' | 'videoUrl'>): MediaType {
  if (doc.photoUrl && doc.videoUrl) return 'photo_video'
  if (doc.videoUrl) return 'video'
  if (doc.photoUrl) return 'photo'
  return 'none'
}

export interface UploadedMediaResult {
  photo?: { fileId: string; url: string }
  video?: { fileId: string; url: string }
}

export async function uploadMediaToDrive(
  qrId: string,
  photo?: { buffer: Buffer; mimetype: string },
  video?: { buffer: Buffer; mimetype: string },
): Promise<UploadedMediaResult> {
  const result: UploadedMediaResult = {}

  try {
    if (photo) {
      const folderId = await ensureQrFolder(qrId, 'photo')
      const ext = photo.mimetype.split('/')[1] ?? 'jpg'
      result.photo = await uploadFile(folderId, `photo.${ext}`, photo.mimetype, photo.buffer, 'photo')
    }
    if (video) {
      const folderId = await ensureQrFolder(qrId, 'video')
      const ext = video.mimetype.split('/')[1] ?? 'mp4'
      result.video = await uploadFile(folderId, `video.${ext}`, video.mimetype, video.buffer, 'video')
    }
    return result
  } catch (err) {
    await cleanupUploaded(result)
    throw err
  }
}

export async function cleanupUploaded(result: UploadedMediaResult): Promise<void> {
  await Promise.all([
    result.photo ? deleteFile(result.photo.fileId).catch(() => undefined) : undefined,
    result.video ? deleteFile(result.video.fileId).catch(() => undefined) : undefined,
  ])
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
