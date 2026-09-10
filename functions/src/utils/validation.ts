import { z } from 'zod'
import { config } from '../config'

export const qrIdSchema = z
  .string()
  .regex(/^(QR-\d{6,}|TEST-QR-\d{4})$/, 'Invalid QR ID format')

// Shape of a generatePublicToken() value (see idAllocator.ts) — 128 random bits,
// hex-encoded. Used to tell a public token apart from a legacy QR-NNNNNN id.
export const publicTokenSchema = z.string().regex(/^[0-9a-f]{32}$/, 'Invalid token format')

export const memoryFieldsSchema = z.object({
  fromName: z.string().trim().max(config.limits.maxNameLength).optional().or(z.literal('')),
  toName: z.string().trim().max(config.limits.maxNameLength).optional().or(z.literal('')),
  message: z.string().trim().max(config.limits.maxMessageLength).optional().or(z.literal('')),
})

export const generateQrSchema = z.object({
  quantity: z.number().int().min(1).max(100000),
  batchLabel: z.string().trim().max(80).optional(),
})
