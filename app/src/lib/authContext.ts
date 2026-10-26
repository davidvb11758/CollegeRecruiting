import { createContext, useContext } from 'react'

export type Role = 'athlete' | 'staff' | 'admin'

export type Account = {
  userId: string
  email: string
  role: Role
  displayName: string
  /** Null until the athlete has created their profile (first login). Always null for staff. */
  athleteId: string | null
}

/** Why the person was sent back to sign-in, shown once. */
export type Notice = 'disabled' | 'expired' | null

export type AuthState =
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'signedOut' }
  | { status: 'error' }
  | { status: 'signedIn'; account: Account }

export type AuthValue = {
  state: AuthState
  notice: Notice
  clearNotice: () => void
  signOut: () => Promise<void>
  /** Re-reads the account, for example after the athlete profile has been created. */
  refresh: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

/** Where a signed-in person starts. */
export function homePath(account: Account): string {
  if (account.role !== 'athlete') return '/staff'
  return account.athleteId ? '/home' : '/profile/create'
}
