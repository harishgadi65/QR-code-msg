import { Readable } from 'node:stream'
import { getDrive } from './driveClient'
import { config } from '../config'

async function findChildFolder(parentId: string, name: string): Promise<string | null> {
  const drive = await getDrive()
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  })
  return res.data.files?.[0]?.id ?? null
}

async function createFolder(parentId: string, name: string): Promise<string> {
  const drive = await getDrive()
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })
  if (!res.data.id) throw new Error('Failed to create Drive folder')
  return res.data.id
}

async function findOrCreateFolder(parentId: string, name: string): Promise<string> {
  const existing = await findChildFolder(parentId, name)
  if (existing) return existing
  return createFolder(parentId, name)
}

export type DriveMediaKind = 'photo' | 'video'

export async function ensureQrFolder(qrId: string, kind: DriveMediaKind): Promise<string> {
  const root = config.drive.rootFolderId()
  const qrFolderId = await findOrCreateFolder(root, qrId)
  return findOrCreateFolder(qrFolderId, kind)
}

export interface UploadedFile {
  fileId: string
  url: string
}

export function urlForFile(fileId: string, kind: DriveMediaKind): string {
  return kind === 'photo'
    ? `https://lh3.googleusercontent.com/d/${fileId}=s1600`
    : `https://drive.google.com/file/d/${fileId}/preview`
}

export async function makeFilePublic(fileId: string): Promise<void> {
  const drive = await getDrive()
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  })
}

export async function uploadFile(
  folderId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer,
  kind: DriveMediaKind,
): Promise<UploadedFile> {
  const drive = await getDrive()

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
  })

  const fileId = res.data.id
  if (!fileId) throw new Error('Drive upload did not return a file id')

  await makeFilePublic(fileId)
  return { fileId, url: urlForFile(fileId, kind) }
}

export interface DriveFileMetadata {
  mimeType: string
  size: number
  parents: string[]
}

export async function getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
  const drive = await getDrive()
  const res = await drive.files.get({ fileId, fields: 'mimeType, size, parents' })
  return {
    mimeType: res.data.mimeType ?? '',
    size: Number(res.data.size ?? 0),
    parents: res.data.parents ?? [],
  }
}

export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = await getDrive()
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  return Buffer.from(res.data as ArrayBuffer)
}

/**
 * Confirms a file the browser just uploaded directly to Drive actually lives inside
 * the folder we handed out an upload token for — a customer's browser holds a real
 * (if narrowly-scoped and short-lived) Drive access token during upload, so this stops
 * it from being used to point an unrelated existing Drive file ID at this QR code.
 */
export async function assertFileInFolder(fileId: string, folderId: string): Promise<DriveFileMetadata> {
  const meta = await getFileMetadata(fileId)
  if (!meta.parents.includes(folderId)) {
    throw new Error('File does not belong to the expected upload folder')
  }
  return meta
}

export async function deleteFile(fileId: string): Promise<void> {
  const drive = await getDrive()
  try {
    await drive.files.delete({ fileId })
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code
    if (status !== 404) throw err
  }
}
