/**
 * Uploads a file straight from the browser to Firebase Storage using a short-lived
 * signed URL minted by our backend (see /qr/:qrId/upload-init) — the file's bytes
 * never pass through our own server, same reason driveUpload.ts worked this way.
 */
export function uploadFileToStorage(uploadUrl: string, file: File | Blob, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error('Upload failed. Please try again.'))
    }
    xhr.onerror = () => reject(new Error('Network error while uploading. Please try again.'))
    xhr.send(file)
  })
}
