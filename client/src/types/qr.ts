export type QrStatus = 'empty' | 'pending_upload' | 'content_added' | 'disabled' | 'archived'

export interface QrDoc {
  qrId: string
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

  scanCount: number
  lastScannedAt: number | null

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
