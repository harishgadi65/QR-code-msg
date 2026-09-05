import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg()
      await ffmpeg.load({
        coreURL: '/ffmpeg/ffmpeg-core.js',
        wasmURL: '/ffmpeg/ffmpeg-core.wasm',
      })
      ffmpegInstance = ffmpeg
      return ffmpeg
    })()
  }
  return loadPromise
}

export async function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve(video.duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      reject(new Error('Could not read video metadata'))
    }
    video.src = URL.createObjectURL(file)
  })
}

export async function trimVideo(
  file: File,
  startSeconds: number,
  endSeconds: number,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const ffmpeg = await getFfmpeg()
  const inputName = `input.${file.name.split('.').pop() ?? 'mp4'}`
  const outputName = 'output.mp4'

  const onProgressEvent = ({ progress }: { progress: number }) => {
    if (onProgress) onProgress(Math.min(1, Math.max(0, progress)))
  }
  ffmpeg.on('progress', onProgressEvent)

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    const duration = (endSeconds - startSeconds).toFixed(2)

    try {
      // Fast path: stream copy (no re-encode). May land on the nearest keyframe.
      await ffmpeg.exec(['-ss', String(startSeconds), '-i', inputName, '-t', duration, '-c', 'copy', outputName])
      const data = await ffmpeg.readFile(outputName)
      if ((data as Uint8Array).length === 0) throw new Error('empty output')
      return new File([data as BlobPart], 'memory-video.mp4', { type: 'video/mp4' })
    } catch {
      // Fallback: re-encode for formats/containers that don't support copy-trim cleanly.
      await ffmpeg.exec([
        '-ss', String(startSeconds),
        '-i', inputName,
        '-t', duration,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '28',
        '-c:a', 'aac',
        outputName,
      ])
      const data = await ffmpeg.readFile(outputName)
      return new File([data as BlobPart], 'memory-video.mp4', { type: 'video/mp4' })
    }
  } finally {
    ffmpeg.off('progress', onProgressEvent)
    await ffmpeg.deleteFile(inputName).catch(() => undefined)
    await ffmpeg.deleteFile(outputName).catch(() => undefined)
  }
}
