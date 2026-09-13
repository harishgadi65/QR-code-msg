export type QrStatus = 'empty' | 'pending_upload' | 'content_added' | 'disabled' | 'archived'

export interface QrDoc {
  qrId: string
  // The random, unguessable string the printed QR code and public link actually
  // encode (/m/<publicToken>) — kept separate from qrId so the sequential admin
  // number is never itself a usable access credential. Nullable only because QR
  // codes generated before this field existed may not have one until backfilled.
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

  // Whoever was signed in with Google when they saved the memory — an audit trail,
  // not an access restriction (anyone with a Google account can still upload).
  uploaderEmail?: string | null
  uploaderName?: string | null

  scanCount: number
  lastScannedAt: number | null

  // Optional privacy controls the uploader can set when saving the memory (see
  // routes/customerQr.ts's finalize and GET /:token). Either or both left null
  // means no restriction. expiresAt is an epoch-ms cutoff; maxScans compares
  // against scanCount.
  expiresAt: number | null
  maxScans: number | null

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
