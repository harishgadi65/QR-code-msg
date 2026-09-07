function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const config = {
  drive: {
    clientId: () => required('GOOGLE_DRIVE_CLIENT_ID'),
    clientSecret: () => required('GOOGLE_DRIVE_CLIENT_SECRET'),
    refreshToken: () => required('GOOGLE_DRIVE_REFRESH_TOKEN'),
    rootFolderId: () => required('GOOGLE_DRIVE_ROOT_FOLDER_ID'),
  },
  limits: {
    maxVideoDurationSeconds: Number(process.env.MAX_VIDEO_DURATION_SECONDS ?? 30),
    maxVideoSizeMb: Number(process.env.MAX_VIDEO_SIZE_MB ?? 80),
    maxAudioDurationSeconds: Number(process.env.MAX_AUDIO_DURATION_SECONDS ?? 60),
    maxAudioSizeMb: Number(process.env.MAX_AUDIO_SIZE_MB ?? 15),
    maxPhotoSizeMb: Number(process.env.MAX_PHOTO_SIZE_MB ?? 15),
    maxMessageLength: Number(process.env.MAX_MESSAGE_LENGTH ?? 500),
    maxNameLength: Number(process.env.MAX_NAME_LENGTH ?? 60),
    // Generous enough to cover a slow mobile upload directly to Drive (see
    // routes/customerQr.ts's upload-init/finalize split) without the QR getting
    // reclaimed as abandoned while a legitimate upload is still in flight.
    pendingUploadTimeoutMs: Number(process.env.PENDING_UPLOAD_TIMEOUT_MS ?? 8 * 60 * 1000),
  },
  appBaseUrl: () => process.env.APP_BASE_URL ?? '',
  // Off by default: flips on once Google sign-in is enabled in the Firebase console
  // and the team is ready to require it before a customer can upload. See
  // routes/customerQr.ts's upload-init/finalize.
  requireUploadSignIn: process.env.REQUIRE_UPLOAD_SIGNIN === 'true',
}
