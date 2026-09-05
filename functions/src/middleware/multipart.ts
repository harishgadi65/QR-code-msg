import busboy from 'busboy'
import type { NextFunction, Request, Response } from 'express'

export interface UploadedFile {
  buffer: Buffer
  mimetype: string
  originalname: string
  size: number
}

export type UploadedFiles = Record<string, UploadedFile[]>

declare module 'express-serve-static-core' {
  interface Request {
    uploadedFiles?: UploadedFiles
    rawBody?: Buffer
  }
}

/**
 * multer's default usage (`req.pipe(busboy)`) doesn't work inside Cloud Functions:
 * the Functions runtime already drains the request into `req.rawBody` before Express
 * sees it, so by the time multer tries to read the stream it has already ended,
 * producing "Unexpected end of form". Feeding busboy the buffered `req.rawBody`
 * directly (instead of piping the exhausted stream) avoids that entirely.
 */
export function parseMultipart(maxFileSizeBytes: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.startsWith('multipart/form-data')) {
      req.uploadedFiles = {}
      next()
      return
    }

    const bb = busboy({ headers: req.headers, limits: { fileSize: maxFileSizeBytes } })
    const files: UploadedFiles = {}
    const fields: Record<string, string> = {}
    let fileTooLarge = false

    bb.on('field', (name, value) => {
      fields[name] = value
    })

    bb.on('file', (name, fileStream, info) => {
      const chunks: Buffer[] = []
      fileStream.on('data', (chunk: Buffer) => chunks.push(chunk))
      fileStream.on('limit', () => {
        fileTooLarge = true
      })
      fileStream.on('end', () => {
        if (fileTooLarge) return
        const buffer = Buffer.concat(chunks)
        files[name] = [
          ...(files[name] ?? []),
          { buffer, mimetype: info.mimeType, originalname: info.filename, size: buffer.length },
        ]
      })
    })

    bb.on('finish', () => {
      if (fileTooLarge) {
        res.status(400).json({ error: 'File is too large.', code: 'FILE_TOO_LARGE' })
        return
      }
      req.body = { ...req.body, ...fields }
      req.uploadedFiles = files
      next()
    })

    bb.on('error', (err: unknown) => next(err))

    if (req.rawBody) {
      bb.end(req.rawBody)
    } else {
      req.pipe(bb)
    }
  }
}
