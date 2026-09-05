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
  admin: {
    allowedEmails: () =>
      (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
  },
  limits: {
    maxVideoDurationSeconds: Number(process.env.MAX_VIDEO_DURATION_SECONDS ?? 60),
    maxVideoSizeMb: Number(process.env.MAX_VIDEO_SIZE_MB ?? 80),
    maxPhotoSizeMb: Number(process.env.MAX_PHOTO_SIZE_MB ?? 15),
    maxMessageLength: Number(process.env.MAX_MESSAGE_LENGTH ?? 500),
    maxNameLength: Number(process.env.MAX_NAME_LENGTH ?? 60),
    pendingUploadTimeoutMs: Number(process.env.PENDING_UPLOAD_TIMEOUT_MS ?? 2 * 60 * 1000),
  },
  appBaseUrl: () => process.env.APP_BASE_URL ?? '',
}
