import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
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

  // Redirect (not popup) because this runs on phones opening a QR link — mobile
  // Safari/in-app browsers block or silently drop popup-based sign-in far more often.
  const loginWithGoogle = async () => {
    setGoogleSignInError(null)
    try {
      await signInWithRedirect(auth, new GoogleAuthProvider())
    } catch (err) {
      console.error('signInWithRedirect failed', err)
      const code = (err as { code?: string; message?: string })?.code
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
