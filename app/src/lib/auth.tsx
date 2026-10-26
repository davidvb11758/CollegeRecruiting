import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext, type Account, type AuthState, type AuthValue, type Notice, type Role } from './authContext'
import { getSupabase } from './supabase'

/** Role and status come from app_user (row-level security), never from the token's editable data. */
async function loadAccount(supabase: SupabaseClient, session: Session): Promise<Account | 'disabled'> {
  const userId = session.user.id
  const { data, error } = await supabase
    .from('app_user')
    .select('role, display_name')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  // A disabled account cannot read its own row, so no row means "not active".
  if (!data) return 'disabled'

  let athleteId: string | null = null
  if (data.role === 'athlete') {
    const athlete = await supabase.from('athlete').select('id').eq('user_id', userId).maybeSingle()
    if (athlete.error) throw athlete.error
    athleteId = athlete.data?.id ?? null
  }
  return {
    userId,
    email: session.user.email ?? '',
    role: data.role as Role,
    displayName: data.display_name ?? '',
    athleteId,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const navigate = useNavigate()
  // undefined = not known yet, null = signed out
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [reloads, setReloads] = useState(0)
  const hadSession = useRef(false)
  const leaving = useRef(false)

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') {
        // A sign-out nobody asked for means the session ran out or was revoked.
        if (hadSession.current && !leaving.current) setNotice((n) => n ?? 'expired')
        hadSession.current = false
        leaving.current = false
      } else if (next) {
        hadSession.current = true
      }
      if (event === 'PASSWORD_RECOVERY') navigate('/reset-password')
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [supabase, navigate])

  // Reload the account when the person changes, not on every token refresh.
  const userId = session?.user.id ?? null
  const known = session !== undefined
  const currentSession = useRef(session)
  useEffect(() => {
    currentSession.current = session
  }, [session])
  useEffect(() => {
    const active = currentSession.current
    if (!supabase || !active) {
      setAccount(known ? null : undefined)
      return
    }
    let cancelled = false
    setFailed(false)
    setAccount(undefined)
    loadAccount(supabase, active).then(
      (result) => {
        if (cancelled) return
        if (result === 'disabled') {
          setNotice('disabled')
          leaving.current = true
          setAccount(null)
          void supabase.auth.signOut()
        } else {
          setAccount(result)
        }
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
    // The session is read through the ref on purpose: only a different person (userId) or a retry reloads.
  }, [supabase, userId, reloads, known])

  const signOut = useCallback(async () => {
    if (!supabase) return
    leaving.current = true
    await supabase.auth.signOut()
  }, [supabase])

  const value = useMemo<AuthValue>(() => {
    let state: AuthState
    if (!supabase) state = { status: 'unconfigured' }
    else if (failed) state = { status: 'error' }
    else if (session === undefined) state = { status: 'loading' }
    else if (session === null || account === null) state = { status: 'signedOut' }
    else if (account === undefined) state = { status: 'loading' }
    else state = { status: 'signedIn', account }
    return {
      state,
      notice,
      clearNotice: () => setNotice(null),
      signOut,
      refresh: () => setReloads((n) => n + 1),
    }
  }, [supabase, failed, session, account, notice, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
