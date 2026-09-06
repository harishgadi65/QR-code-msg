/**
 * One-time script to obtain a Google Drive OAuth2 refresh token AND create the root
 * folder that will hold every QR code's photos/videos.
 *
 * 1. In Google Cloud Console, create an OAuth 2.0 Client ID of type "Desktop app".
 * 2. Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in your shell.
 * 3. Run: npm run get-drive-token
 * 4. Sign in with the Google account that should own the uploaded photos/videos.
 * 5. Copy the two printed values into functions/.env.
 *
 * Why this script creates the folder (rather than you creating one by hand in Drive):
 * the app only requests the `drive.file` scope, which limits it to files/folders the
 * app itself created — a folder made through the regular Drive website would NOT be
 * visible to it. Creating the root folder here, through this same authenticated
 * session, is what makes it "app-created" and therefore accessible later.
 */
import http from 'node:http'
import { URL } from 'node:url'
import { google } from 'googleapis'
import open from 'open'

const PORT = 53682
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`
const ROOT_FOLDER_NAME = 'QR-MEMORIES'

async function main() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error('Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET first.')
    process.exit(1)
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    // drive.file (not the full "drive" scope) limits every token this app ever mints
    // to only the files/folders it creates itself — never the rest of the Drive account.
    scope: ['https://www.googleapis.com/auth/drive.file'],
  })

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '', REDIRECT_URI)
      const authCode = url.searchParams.get('code')
      if (authCode) {
        res.end('Success! You can close this tab and return to the terminal.')
        server.close()
        resolve(authCode)
      } else {
        res.end('No code received.')
        server.close()
        reject(new Error('No authorization code received'))
      }
    })
    server.listen(PORT, () => {
      console.log('Opening browser for Google sign-in...')
      open(authUrl).catch(() => console.log(`Open this URL manually:\n${authUrl}`))
    })
  })

  const { tokens } = await oauth2Client.getToken(code)
  if (!tokens.refresh_token) {
    console.error('No refresh token returned. Revoke prior access at https://myaccount.google.com/permissions and try again.')
    process.exit(1)
  }
  oauth2Client.setCredentials(tokens)

  const drive = google.drive({ version: 'v3', auth: oauth2Client })
  const created = await drive.files.create({
    requestBody: { name: ROOT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  })

  console.log('\nSet these in functions/.env:\n')
  console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`)
  console.log(`GOOGLE_DRIVE_ROOT_FOLDER_ID=${created.data.id}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
