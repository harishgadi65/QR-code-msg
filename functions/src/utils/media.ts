import { chmodSync } from 'node:fs'
import { writeFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from '../config'

// Lazily imported: @ffprobe-installer/ffprobe eagerly requires a platform-specific binary
// package (e.g. linux-x64) at module load time, which can be missing depending on how the
// serverless host installed dependencies. Deferring the import means a broken ffprobe only
// breaks video-duration checks, instead of crashing every request the app ever serves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpegPromise: Promise<any> | null = null
function getFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = Promise.all([import('fluent-ffmpeg'), import('@ffprobe-installer/ffprobe')]).then(
      ([ffmpegModule, ffprobeModule]) => {
        const ffmpeg = (ffmpegModule as { default?: unknown }).default ?? ffmpegModule
        const ffprobeInstaller = (ffprobeModule as { default?: { path: string } }).default ?? ffprobeModule
        const ffprobePath = (ffprobeInstaller as { path: string }).path
        // The installer's own postinstall script (which chmods this binary) may not have
        // run — e.g. Vercel's build blocks npm lifecycle scripts by default — so the file
        // can end up non-executable even though it's present. Fix that defensively here
        // rather than depending on the host's npm install behavior.
        try {
          chmodSync(ffprobePath, 0o755)
        } catch {
          // ignore: read-only filesystem, or already executable
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(ffmpeg as any).setFfprobePath(ffprobePath)
        return ffmpeg
      },
    )
  }
  return ffmpegPromise
}

export class MediaValidationError extends Error {
  code = 'MEDIA_INVALID'
}

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
// Browsers' MediaRecorder produces these depending on platform (webm/opus on
// Chrome/Android, mp4/aac on Safari/iOS).
export const AUDIO_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a']

export function validatePhoto(file: { mimetype: string; size: number }) {
  if (!PHOTO_MIME_TYPES.includes(file.mimetype)) {
    throw new MediaValidationError('Unsupported photo format. Please use JPG, PNG, or WEBP.')
  }
  if (file.size > config.limits.maxPhotoSizeMb * 1024 * 1024) {
    throw new MediaValidationError(`Photo is too large. Maximum size is ${config.limits.maxPhotoSizeMb}MB.`)
  }
}

export function validateVideoUpload(file: { mimetype: string; size: number }) {
  if (!VIDEO_MIME_TYPES.includes(file.mimetype)) {
    throw new MediaValidationError('Unsupported video format. Please use MP4, MOV, or WebM.')
  }
  if (file.size > config.limits.maxVideoSizeMb * 1024 * 1024) {
    throw new MediaValidationError(`Video is too large. Maximum size is ${config.limits.maxVideoSizeMb}MB.`)
  }
}

export function validateAudioUpload(file: { mimetype: string; size: number }) {
  if (!AUDIO_MIME_TYPES.includes(file.mimetype)) {
    throw new MediaValidationError('Unsupported voice message format.')
  }
  if (file.size > config.limits.maxAudioSizeMb * 1024 * 1024) {
    throw new MediaValidationError(`Voice message is too large. Maximum size is ${config.limits.maxAudioSizeMb}MB.`)
  }
}

export async function getMediaDurationSeconds(buffer: Buffer): Promise<number> {
  const ffmpeg = await getFfmpeg()
  const tmpPath = path.join(os.tmpdir(), `probe-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  await writeFile(tmpPath, buffer)
  try {
    return await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tmpPath, (err: Error | null, data: { format: { duration?: number } }) => {
        if (err) {
          reject(new MediaValidationError('Could not read this file. It may be corrupted.'))
          return
        }
        resolve(data.format.duration ?? 0)
      })
    })
  } finally {
    await unlink(tmpPath).catch(() => undefined)
  }
}

export async function assertVideoWithinDuration(buffer: Buffer): Promise<void> {
  const duration = await getMediaDurationSeconds(buffer)
  if (duration > config.limits.maxVideoDurationSeconds + 1) {
    throw new MediaValidationError(
      `Video is ${Math.round(duration)}s, which exceeds the ${config.limits.maxVideoDurationSeconds}s limit. Please trim it first.`,
    )
  }
}

export async function assertAudioWithinDuration(buffer: Buffer): Promise<void> {
  const duration = await getMediaDurationSeconds(buffer)
  if (duration > config.limits.maxAudioDurationSeconds + 1) {
    throw new MediaValidationError(
      `Voice message is ${Math.round(duration)}s, which exceeds the ${config.limits.maxAudioDurationSeconds}s limit.`,
    )
  }
}
