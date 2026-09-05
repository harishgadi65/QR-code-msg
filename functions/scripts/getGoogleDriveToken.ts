/**
 * One-time script to obtain a Google Drive OAuth2 refresh token.
 *
 * 1. In Google Cloud Console, create an OAuth 2.0 Client ID of type "Desktop app".
 * 2. Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in your shell.
 * 3. Run: npx ts-node scripts/getGoogleDriveToken.ts
 * 4. Sign in with the Google account that should own the uploaded photos/videos.
 * 5. Copy the printed refresh token into GOOGLE_DRIVE_REFRESH_TOKEN.
 */
import http from 'node:http'
import { URL } from 'node:url'
import { google } from 'googleapis'
import open from 'open'

const PORT = 53682
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`

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
    scope: ['https://www.googleapis.com/auth/drive'],
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

  console.log('\nSet this in your functions environment config:\n')
  console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
