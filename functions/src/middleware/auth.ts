import type { NextFunction, Request, Response } from 'express'
import { auth } from '../services/firebaseAdmin'

export interface AuthedRequest extends Request {
  uid?: string
  isAdmin?: boolean
}

export async function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const decoded = await auth.verifyIdToken(header.slice('Bearer '.length))
      req.uid = decoded.uid
      req.isAdmin = decoded.admin === true
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
