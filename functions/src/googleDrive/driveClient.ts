import type { drive_v3 } from 'googleapis'
import { config } from '../config'

let drivePromise: Promise<drive_v3.Drive> | null = null

// googleapis is a very large package (it bundles every Google API surface). Importing
// it eagerly at module load time can be slow enough to blow past the Functions
// emulator's discovery timeout, so it's loaded lazily on first actual Drive call
// instead of at the top of this file.
export function getDrive(): Promise<drive_v3.Drive> {
  if (!drivePromise) {
    drivePromise = import('googleapis').then(({ google }) => {
      const oauth2Client = new google.auth.OAuth2(config.drive.clientId(), config.drive.clientSecret())
      oauth2Client.setCredentials({ refresh_token: config.drive.refreshToken() })
      return google.drive({ version: 'v3', auth: oauth2Client })
    })
  }
  return drivePromise
}
