import { z } from 'zod'
import { config } from '../config'

export const qrIdSchema = z
  .string()
  .regex(/^(QR-\d{6,}|TEST-QR-\d{4})$/, 'Invalid QR ID format')

// Shape of a generatePublicToken() value (see idAllocator.ts) — 128 random bits,
// hex-encoded. Used to tell a public token apart from a legacy QR-NNNNNN id.
export const publicTokenSchema = z.string().regex(/^[0-9a-f]{32}$/, 'Invalid token format')

export const pinSchema = z.string().regex(/^\d{4}$/, 'PIN must be 4 digits')

export const memoryFieldsSchema = z.object({
  fromName: z.string().trim().max(config.limits.maxNameLength).optional().or(z.literal('')),
  toName: z.string().trim().max(config.limits.maxNameLength).optional().or(z.literal('')),
  message: z.string().trim().max(config.limits.maxMessageLength).optional().or(z.literal('')),
  // Optional privacy controls: the uploader can make the memory auto-expire after N
  // days and/or stop being viewable after N views. Both unset means no restriction.
  expiresInDays: z.number().int().min(1).max(config.limits.maxMemoryExpiryDays).optional(),
  maxScans: z.number().int().min(config.limits.minMemoryScanLimit).max(config.limits.maxMemoryScanLimit).optional(),
  // Optional 4-digit PIN gate — see services/pinAuth.ts.
  pin: pinSchema.optional(),
})

export const generateQrSchema = z.object({
  quantity: z.number().int().min(1).max(100000),
  batchLabel: z.string().trim().max(80).optional(),
})

// Digits only (the client strips spaces/dashes before sending) — deliberately
// loose on length so both local and international numbers work, since this is
// just the lookup key the sender shares with the receiver, not a verified contact.
export const phoneNumberSchema = z.string().regex(/^\d{7,15}$/, 'Please enter a valid phone number')

export const orderMemoryFieldsSchema = z.object({
  fromName: z.string().trim().max(config.limits.maxNameLength).optional().or(z.literal('')),
  toName: z.string().trim().max(config.limits.maxNameLength).optional().or(z.literal('')),
  message: z.string().trim().max(config.limits.maxMessageLength).optional().or(z.literal('')),
  // Required for this flow (unlike qr.ts's optional pin) — this is the access
  // credential a receiver will use later to look this submission back up.
  phoneNumber: phoneNumberSchema,
  pin: pinSchema,
})
