export type QrStatus = 'empty' | 'pending_upload' | 'content_added' | 'disabled' | 'archived'

export interface QrDoc {
  qrId: string
  batchId: string | null
  status: QrStatus
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

  pendingSince: number | null

  createdAt: number
  updatedAt: number
}

export interface BatchDoc {
  batchId: string
  quantity: number
  startQrId: string
  endQrId: string
  createdAt: number
  createdBy: string
}
