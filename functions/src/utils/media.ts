import { writeFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import { config } from '../config'

ffmpeg.setFfprobePath(ffprobeInstaller.path)

export class MediaValidationError extends Error {
  code = 'MEDIA_INVALID'
}

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

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

export async function getVideoDurationSeconds(buffer: Buffer): Promise<number> {
  const tmpPath = path.join(os.tmpdir(), `probe-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  await writeFile(tmpPath, buffer)
  try {
    return await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tmpPath, (err, data) => {
        if (err) {
          reject(new MediaValidationError('Could not read the video file. It may be corrupted.'))
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
  const duration = await getVideoDurationSeconds(buffer)
  if (duration > config.limits.maxVideoDurationSeconds + 1) {
    throw new MediaValidationError(
      `Video is ${Math.round(duration)}s, which exceeds the ${config.limits.maxVideoDurationSeconds}s limit. Please trim it first.`,
    )
  }
}
