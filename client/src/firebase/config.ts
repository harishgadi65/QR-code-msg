import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'

// Firestore is intentionally not used from the client at all — every read and write
// goes through the Cloud Functions API (see src/services/api.ts) so the security
// rules can deny direct client access entirely. Auth is the only Firebase client SDK
// piece needed here, to sign admins in and attach their ID token to API requests.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-qrmemory',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

if (import.meta.env.DEV && import.meta.env.VITE_USE_AUTH_EMULATOR !== 'false') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
}
