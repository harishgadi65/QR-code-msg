// The single reusable QR code printed on chocolate boxes sold online — unlike
// qr.ts's QrDoc (one QR per gift, scanned by its one intended recipient), this
// same code is scanned by many different buyers, each of whom creates their own
// OrderSubmissionDoc rather than filling in a single shared document.
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
  photoStoragePath: string | null
  videoUrl: string | null
  videoStoragePath: string | null
  audioUrl: string | null
  audioStoragePath: string | null

  // The access credential for this submission, set by the uploader at finalize
  // time — unlike qr.ts's pinHash/pinSalt, this is stored and shown in plaintext
  // in the admin tab by explicit product decision, since many different buyers
  // share one QR and the admin needs to be able to help a confused customer
  // locate or confirm their own submission.
  phoneNumber: string | null
  pin: string | null

  pendingSince: number | null
  createdAt: number
  updatedAt: number
}
