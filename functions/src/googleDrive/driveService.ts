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

  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  const url =
    kind === 'photo'
      ? `https://lh3.googleusercontent.com/d/${fileId}=s1600`
      : `https://drive.google.com/file/d/${fileId}/preview`

  return { fileId, url }
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
