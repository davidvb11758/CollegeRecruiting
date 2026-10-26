import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY'
type ErrorLike = { message: string; code?: string; status?: number }

export type FakeWorld = {
  /** Who is signed in when the app starts. */
  session: Session | null
  /** The app_user row the person can read. null = no readable row (a disabled account). */
  appUser: { role: 'athlete' | 'staff' | 'admin'; display_name: string } | null
  /** The athlete row, if the athlete has created a profile. */
  athlete: { id: string } | null
  signInError: ErrorLike | null
  signUpError: ErrorLike | null
  signUpSession: boolean
}

export function makeSession(email = 'family@example.com'): Session {
  return { access_token: 't', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, user: { id: 'user-1', email } } as Session
}

/** A stand-in for the Supabase client with just the calls the app makes. */
export function makeFakeSupabase(initial: Partial<FakeWorld> = {}) {
  const world: FakeWorld = {
    session: null,
    appUser: { role: 'athlete', display_name: 'Pat Player' },
    athlete: { id: 'athlete-1' },
    signInError: null,
    signUpError: null,
    signUpSession: true,
    ...initial,
  }
  let listener: ((event: AuthEvent, session: Session | null) => void) | null = null
  const emit = (event: AuthEvent, session: Session | null) => listener?.(event, session)

  const client = {
    auth: {
      onAuthStateChange: vi.fn((cb: typeof listener) => {
        listener = cb
        setTimeout(() => emit('INITIAL_SESSION', world.session), 0)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signInWithPassword: vi.fn(async () => {
        if (world.signInError) return { data: { session: null }, error: world.signInError }
        world.session = makeSession()
        emit('SIGNED_IN', world.session)
        return { data: { session: world.session }, error: null }
      }),
      signUp: vi.fn(async () => {
        if (world.signUpError) return { data: { session: null }, error: world.signUpError }
        if (world.signUpSession) {
          world.session = makeSession()
          emit('SIGNED_IN', world.session)
        }
        return { data: { session: world.signUpSession ? world.session : null }, error: null }
      }),
      signOut: vi.fn(async () => {
        world.session = null
        emit('SIGNED_OUT', null)
        return { error: null }
      }),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
      updateUser: vi.fn(async () => ({ data: {}, error: null })),
    },
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === 'app_user' ? world.appUser : world.athlete, error: null }),
        }),
      }),
    })),
  }
  return { client, world, emit }
}
