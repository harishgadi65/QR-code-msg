import { auth } from '../firebase/config'

// When the frontend is served from Firebase Hosting, "/api/**" is rewritten to the
// Cloud Function on the same origin (see firebase.json). When served from a static
// host with no rewrite support (GitHub Pages, etc.), VITE_API_BASE_URL must point
// directly at the deployed function's URL instead, e.g.
// https://us-central1-<project>.cloudfunctions.net/api
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser
  if (!user) return {}
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: { error?: string; code?: string } = {}
    try {
      body = await res.json()
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(body.error ?? 'Something went wrong. Please try again.', res.status, body.code)
  }
  return res.json() as Promise<T>
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: await authHeaders() })
  return handle<T>(res)
}

async function jsonRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return handle<T>(res)
}

export const apiPost = <T>(path: string, body?: unknown) => jsonRequest<T>('POST', path, body)
export const apiPatch = <T>(path: string, body?: unknown) => jsonRequest<T>('PATCH', path, body)
export const apiDelete = <T>(path: string) => jsonRequest<T>('DELETE', path)

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  onProgress?: (pct: number) => void,
): Promise<T> {
  const headers = await authHeaders()

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}${path}`)
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value as string)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let body: { error?: string; code?: string } = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // ignore non-JSON error bodies
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T)
      } else {
        reject(new ApiError(body.error ?? 'Upload failed. Please try again.', xhr.status, body.code))
      }
    }
    xhr.onerror = () => reject(new ApiError('Network error during upload.', 0))
    xhr.send(formData)
  })
}
