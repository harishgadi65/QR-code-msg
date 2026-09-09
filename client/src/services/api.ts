import { auth } from '../firebase/config'

// The backend (functions/) deploys separately from this frontend — as Vercel
// serverless functions, not Firebase Hosting/Functions (see functions/README notes).
// VITE_API_BASE_URL should point at that deployment, e.g. https://your-api.vercel.app/api.
// Left unset, requests fall back to a same-origin "/api" path, which only works for
// local dev (Vite's proxy — see vite.config.ts) or a setup that fronts both under one
// domain via its own reverse proxy.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

// Plays a saved voice message or video through our own backend instead of
// embedding Drive's /preview page — that page works, but its UI chrome includes
// a "pop out" button that sends visitors straight to a raw Google Drive page,
// and for videos Drive hasn't finished transcoding yet, a "still being
// processed" overlay in place of the file.
export function audioProxyUrl(driveId: string): string {
  return `${API_BASE}/media/audio/${driveId}`
}

export function videoProxyUrl(driveId: string): string {
  return `${API_BASE}/media/video/${driveId}`
}

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
