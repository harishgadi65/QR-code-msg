import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { auth } from '../firebase/config'

interface AuthState {
  user: User | null
  isAdmin: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  // Set if signInWithRedirect's round trip (the browser leaving for Google and
  // coming back) itself failed — e.g. a misconfigured provider or a blocked
  // storage context on the phone's browser. Previously swallowed silently,
  // which made a real failure look like the button just doing nothing.
  googleSignInError: string | null
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [googleSignInError, setGoogleSignInError] = useState<string | null>(null)

  useEffect(() => {
    // Picks up the account after signInWithRedirect bounces the browser back here
    // (used by the customer upload gate — see loginWithGoogle below).
    getRedirectResult(auth).catch((err) => {
      console.error('getRedirectResult failed', err)
      setGoogleSignInError(err?.code ? `${err.code}: ${err.message}` : String(err))
    })
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      if (nextUser) {
        const token = await nextUser.getIdTokenResult()
        setIsAdmin(token.claims.admin === true)
      } else {
        setIsAdmin(false)
      }
      setLoading(false)
    })
  }, [])

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  // Popup first: the authDomain (qr-code-project-88924.firebaseapp.com) differs
  // from this app's own domain, and the redirect flow's pending-sign-in state
  // has to survive that cross-origin round trip via storage that some browsers
  // partition away — in practice that silently drops the result, bouncing the
  // user back to "please sign in" even after they completed it on Google's side.
  // Popup avoids the round trip entirely (same-session postMessage instead of
  // storage), so it's used whenever the browser allows it; redirect is only the
  // fallback for when a popup genuinely can't open (blocked, or an environment
  // that doesn't support popups at all, e.g. some in-app browsers).
  const loginWithGoogle = async () => {
    setGoogleSignInError(null)
    const provider = new GoogleAuthProvider()
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      const code = (err as { code?: string; message?: string })?.code
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return
      }
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await signInWithRedirect(auth, provider)
          return
        } catch (redirectErr) {
          console.error('signInWithRedirect fallback failed', redirectErr)
          const redirectCode = (redirectErr as { code?: string; message?: string })?.code
          setGoogleSignInError(
            redirectCode ? `${redirectCode}: ${(redirectErr as { message?: string }).message}` : String(redirectErr),
          )
          return
        }
      }
      console.error('signInWithPopup failed', err)
      setGoogleSignInError(code ? `${code}: ${(err as { message?: string }).message}` : String(err))
    }
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, login, loginWithGoogle, logout, googleSignInError }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
