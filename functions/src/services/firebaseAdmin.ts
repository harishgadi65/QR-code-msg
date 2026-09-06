import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Vercel has no ambient Google credentials (unlike Firebase Functions/Cloud Run), so in
// production we pass the service account key explicitly via an env var. Locally, this is
// left unset and initializeApp() falls back to the emulators (FIRESTORE_EMULATOR_HOST /
// FIREBASE_AUTH_EMULATOR_HOST), which don't need real credentials at all.
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY

export const app = serviceAccountKey
  ? initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) })
  : initializeApp()
export const auth = getAuth(app)
export const db = getFirestore(app)
