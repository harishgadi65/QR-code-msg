import * as functionsV1 from 'firebase-functions/v1'
import { auth } from '../services/firebaseAdmin'
import { config } from '../config'

// Grants the admin custom claim automatically when an allowlisted email signs up.
// Primary admin account creation should still go through scripts/createAdmin.ts.
export const onUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  const email = user.email?.toLowerCase()
  if (!email) return
  if (config.admin.allowedEmails().includes(email)) {
    await auth.setCustomUserClaims(user.uid, { admin: true })
  }
})
