/**
 * Uploads a file straight from the browser to Google Drive using a short-lived access
 * token minted by our backend (see /qr/:qrId/upload-init) — the file's bytes never
 * pass through our own server, which is what keeps this working within serverless
 * hosts' small request-body limits (Vercel, Netlify, etc.).
 */
export function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  file: File | Blob,
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const boundary = `qr_upload_${Math.random().toString(36).slice(2)}`
  const metadata = { name: filename, parents: [folderId] }
  const mimeType = file.type || 'application/octet-stream'

  const preamble =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  const epilogue = `\r\n--${boundary}--`

  const body = new Blob([preamble, file, epilogue])

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id')
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { id?: string }
          if (!data.id) throw new Error('missing id')
          resolve(data.id)
        } catch {
          reject(new Error('Drive did not return a file id.'))
        }
      } else {
        reject(new Error('Upload to Google Drive failed. Please try again.'))
      }
    }
    xhr.onerror = () => reject(new Error('Network error while uploading. Please try again.'))
    xhr.send(body)
  })
}
