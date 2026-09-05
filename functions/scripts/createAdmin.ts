/**
 * One-time script to create (or promote) an admin user.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
 *   npx ts-node scripts/createAdmin.ts admin@example.com "StrongPassword123!"
 *
 * The service account key can be downloaded from:
 *   Firebase Console -> Project Settings -> Service Accounts -> Generate new private key
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

async function main() {
  const [email, password] = process.argv.slice(2)
  if (!email || !password) {
    console.error('Usage: ts-node scripts/createAdmin.ts <email> <password>')
    process.exit(1)
  }

  initializeApp({ credential: applicationDefault() })
  const auth = getAuth()

  let user
  try {
    user = await auth.getUserByEmail(email)
    await auth.updateUser(user.uid, { password })
    console.log(`Updated existing user ${email}`)
  } catch {
    user = await auth.createUser({ email, password })
    console.log(`Created new user ${email}`)
  }

  await auth.setCustomUserClaims(user.uid, { admin: true })
  console.log(`Granted admin claim to ${email} (uid: ${user.uid})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
