export type QrStatus = 'empty' | 'pending_upload' | 'content_added' | 'disabled' | 'archived'

export interface QrDoc {
  qrId: string
  // The unguessable string the printed QR image/link actually encodes — see
  // functions/src/types/qr.ts for why this is separate from qrId. May be null
  // for very old records not yet backfilled; callers should fall back to qrId.
  publicToken: string | null
  batchId: string | null
  status: QrStatus
  statusBeforeTrash?: QrStatus | null
  isTest: boolean

  fromName: string | null
  toName: string | null
  message: string | null

  photoUrl: string | null
  photoDriveId: string | null

  videoUrl: string | null
  videoDriveId: string | null

  audioUrl: string | null
  audioDriveId: string | null

  uploaderEmail?: string | null
  uploaderName?: string | null

  // Lifetime page-load count in any status — includes the uploader's own pre-save
  // visits, so this is NOT what maxScans is checked against (see viewCount below).
  scanCount: number
  lastScannedAt: number | null

  // Optional privacy controls the uploader could set when saving the memory —
  // null means no restriction. expiresAt is an epoch-ms cutoff.
  expiresAt: number | null
  maxScans: number | null
  // Views of the saved memory only, reset to 0 each time new content is saved.
  viewCount: number

  createdAt: number
  updatedAt: number
}

export interface BatchDoc {
  batchId: string
  quantity: number
  label: string | null
  startQrId: string
  endQrId: string
  createdAt: number
  createdBy: string | null
}

export type MediaType = 'none' | 'photo' | 'video' | 'photo_video'

export function mediaTypeOf(qr: Pick<QrDoc, 'photoUrl' | 'videoUrl'>): MediaType {
  if (qr.photoUrl && qr.videoUrl) return 'photo_video'
  if (qr.videoUrl) return 'video'
  if (qr.photoUrl) return 'photo'
  return 'none'
}
