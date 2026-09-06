import type { drive_v3, google as GoogleApis } from 'googleapis'
import { config } from '../config'

type OAuth2Client = InstanceType<typeof GoogleApis.auth.OAuth2>

let oauth2ClientPromise: Promise<OAuth2Client> | null = null
let drivePromise: Promise<drive_v3.Drive> | null = null

// googleapis is a very large package (it bundles every Google API surface). Importing
// it eagerly at module load time slows down cold starts, so it's loaded lazily on
// first actual Drive call instead of at the top of this file.
function getOAuth2Client(): Promise<OAuth2Client> {
  if (!oauth2ClientPromise) {
    oauth2ClientPromise = import('googleapis').then(({ google }) => {
      const oauth2Client = new google.auth.OAuth2(config.drive.clientId(), config.drive.clientSecret())
      oauth2Client.setCredentials({ refresh_token: config.drive.refreshToken() })
      return oauth2Client
    })
  }
  return oauth2ClientPromise
}

export async function getDrive(): Promise<drive_v3.Drive> {
  if (!drivePromise) {
    drivePromise = Promise.all([import('googleapis'), getOAuth2Client()]).then(([{ google }, auth]) =>
      google.drive({ version: 'v3', auth }),
    )
  }
  return drivePromise
}

/**
 * Mints a short-lived (~1hr) Drive access token so the browser can upload a file's
 * bytes directly to Google, instead of relaying them through this server — needed
 * because serverless hosts like Vercel cap request body size well below typical photo
 * or video sizes. The long-lived refresh token itself never leaves the server; only
 * this narrowly-scoped, expiring token does. The OAuth app should only request the
 * `drive.file` scope (see functions/scripts/getGoogleDriveToken.ts), which limits any
 * token minted here to files/folders this app itself created — never the rest of the
 * Drive account.
 */
export async function mintUploadAccessToken(): Promise<string> {
  const client = await getOAuth2Client()
  const { token } = await client.getAccessToken()
  if (!token) throw new Error('Failed to obtain a Google Drive access token')
  return token
}
