import type { NextFunction, Request, Response } from 'express'
import { auth } from '../services/firebaseAdmin'

export interface AuthedRequest extends Request {
  uid?: string
  isAdmin?: boolean
  email?: string
  name?: string
}

export async function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const decoded = await auth.verifyIdToken(header.slice('Bearer '.length))
      req.uid = decoded.uid
      req.isAdmin = decoded.admin === true
      req.email = decoded.email
      req.name = decoded.name
    } catch {
      // invalid/expired token: treat request as unauthenticated
    }
  }
  next()
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.isAdmin) {
    res.status(403).json({ error: 'Admin access required.', code: 'FORBIDDEN' })
    return
  }
  next()
}

// Gates the customer upload flow: any signed-in Google account is enough (no admin
// claim needed) — this exists so an anonymous stranger can't attach content to a QR
// before the intended gift-giver does, and so we know whose account uploaded what.
export function requireSignedIn(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.uid) {
    res.status(401).json({ error: 'Please sign in with Google before uploading.', code: 'SIGN_IN_REQUIRED' })
    return
  }
  next()
}
