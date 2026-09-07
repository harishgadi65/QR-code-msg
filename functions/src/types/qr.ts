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

  audioUrl: string | null
  audioDriveId: string | null

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
