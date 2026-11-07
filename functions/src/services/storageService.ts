import { randomUUID } from 'node:crypto'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../config'

export type StorageMediaKind = 'photo' | 'video' | 'audio'

let client: S3Client | undefined
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: config.storage.accountEndpoint(),
      credentials: {
        accessKeyId: config.storage.accessKeyId(),
        secretAccessKey: config.storage.secretAccessKey(),
      },
    })
  }
  return client
}

function bucket(): string {
  return config.storage.bucketName()
}

export function storagePathFor(qrId: string, kind: StorageMediaKind): string {
  return `qr-memories/${qrId}/${kind}/${randomUUID()}`
}

// R2 enforces CORS itself (unlike Drive, which never needed this — uploads went
// through Drive's own API with an Authorization header, not a direct cross-origin
// PUT), so the browser's direct-to-bucket upload needs this set once. Cheap and
// idempotent, so just re-applying it on first use per cold start is simpler than
// a one-off setup script run somewhere else with its own credentials to manage.
let corsEnsured = false
export async function ensureBucketCors(): Promise<void> {
  if (corsEnsured) return
  await s3().send(
    new PutBucketCorsCommand({
      Bucket: bucket(),
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: config.storage.allowedOrigins(),
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedHeaders: ['Content-Type'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  )
  corsEnsured = true
}

// Signed for a plain PUT (not the Content-Type itself — left unconstrained here so
// the browser can send whatever the File's real type is; validateAndPublishStorageUpload
// checks the type actually used against the allow-list after the fact, the same trust
// boundary driveService.ts's assertFileInFolder covered for Drive).
export async function mintUploadUrl(path: string): Promise<string> {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: path }), { expiresIn: 15 * 60 })
}

export interface StorageFileMetadata {
  contentType: string
  size: number
}

export async function getFileMetadata(path: string): Promise<StorageFileMetadata> {
  const meta = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: path }))
  return { contentType: meta.ContentType ?? '', size: Number(meta.ContentLength ?? 0) }
}

export async function downloadFile(path: string): Promise<Buffer> {
  const obj = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: path }))
  const chunks: Buffer[] = []
  for await (const chunk of obj.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// Mirrors Drive's makeFilePublic + urlForFile: the bucket's public base URL (its
// r2.dev subdomain, enabled once in the R2 dashboard, or a custom domain later)
// plus the object's own key is already a stable, permanent public link — unlike
// Firebase Storage's download-token mechanism, R2 needs nothing stored per-file
// for this since the whole bucket's read access is public, not per-object.
export async function publishFile(path: string): Promise<string> {
  return `${config.storage.publicBaseUrl()}/${path}`
}

// Separate from publishFile's URL: that one plays inline, this one forces a real
// "Save file" prompt via responseDisposition — same purpose as media.ts's
// ?download=1 proxy route for Drive-backed content, but S3-compatible signed URLs
// can bake the header in directly, no proxy server needed.
export async function signedDownloadUrl(path: string, filename: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: path,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn: 60 * 60 },
  )
}

export async function deleteFile(path: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: path }))
}
