import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// A 4-digit PIN only has 10,000 possible values, so the hash itself isn't the real
// protection (anyone with direct database access could brute-force it offline in
// milliseconds regardless of algorithm) — the actual defense is the attempt lockout
// enforced in routes/customerQr.ts's verify-pin. This hash only guards against the
// much narrower case of someone glancing at the stored document.
const KEY_LENGTH = 32

export function generatePinSalt(): string {
  return randomBytes(16).toString('hex')
}

export function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, KEY_LENGTH).toString('hex')
}

export function verifyPinHash(pin: string, salt: string, expectedHash: string): boolean {
  const actual = scryptSync(pin, salt, KEY_LENGTH)
  const expected = Buffer.from(expectedHash, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
