export interface OrderQrDoc {
  qrId: string
  publicToken: string
  createdAt: number
}

export type OrderSubmissionStatus = 'pending_upload' | 'content_added'

export interface OrderSubmissionDoc {
  submissionId: string
  status: OrderSubmissionStatus

  uploaderEmail: string | null
  uploaderName: string | null

  fromName: string | null
  toName: string | null
  message: string | null

  photoUrl: string | null
  videoUrl: string | null
  audioUrl: string | null

  // Shown in plaintext in the admin tab by deliberate product decision — see
  // functions/src/types/orderQr.ts.
  phoneNumber: string | null
  pin: string | null

  createdAt: number
  updatedAt: number
}
