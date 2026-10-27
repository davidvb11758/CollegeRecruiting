import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY'
type ErrorLike = { message: string; code?: string; status?: number }
type Row = Record<string, unknown>

export type FakeWorld = {
  /** Who is signed in when the app starts. */
  session: Session | null
  /** The app_user row the person can read. null = no readable row (a disabled account). */
  appUser: { role: 'athlete' | 'staff' | 'admin'; display_name: string } | null
  /** The athlete row, if the athlete has created a profile. */
  athlete: Row | null
  signInError: ErrorLike | null
  signUpError: ErrorLike | null
  signUpSession: boolean
  /** Extra or replacement table contents, by table name. */
  tables: Record<string, Row[]>
  /** The error every write to this table should fail with. */
  failWrites: Record<string, ErrorLike>
  /** The error every read of this table should fail with. */
  failReads: Record<string, ErrorLike>
  /** Fail only the nth write (1 = the first) to this table, to test a save that stops half way. */
  failNthWrite: Record<string, { n: number; error: ErrorLike }>
}

export function makeSession(email = 'family@example.com'): Session {
  return { access_token: 't', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, user: { id: 'user-1', email } } as Session
}

const LOOKUPS: Record<string, Row[]> = {
  player_position: [
    { code: 'OH', label: 'Outside Hitter', sort_order: 1 },
    { code: 'S', label: 'Setter', sort_order: 2 },
  ],
  state: [
    { code: 'IA', name: 'Iowa', sort_order: 1 },
    { code: 'MN', name: 'Minnesota', sort_order: 2 },
  ],
  major_category: [
    { code: 'BUSN', label: 'Business & management', sort_order: 1 },
    { code: 'COMP', label: 'Computer & information sciences', sort_order: 2 },
    { code: 'HLTH', label: 'Health professions & nursing', sort_order: 3 },
    { code: 'ENGR', label: 'Engineering', sort_order: 4 },
  ],
  division: [
    { code: 'NCAA_D1', label: 'NCAA Division I', sort_order: 1 },
    { code: 'NCAA_D2', label: 'NCAA Division II', sort_order: 2 },
    { code: 'NCAA_D3', label: 'NCAA Division III', sort_order: 3 },
    { code: 'NAIA', label: 'NAIA', sort_order: 4 },
  ],
  team: [{ id: 'team-1', name: 'Iowa Rockets 16R' }],
}

export const ATHLETE_ROW: Row = {
  id: 'athlete-1',
  user_id: 'user-1',
  team_id: 'team-1',
  first_name: 'Pat',
  last_name: 'Player',
  date_of_birth: '2010-05-01',
  graduation_year: 2029,
  home_state: 'IA',
}

/** Same rule as the database: % is any text, a backslash makes the next character plain. */
function likeToRegExp(pattern: string): RegExp {
  const plain = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\' && i + 1 < pattern.length) out += plain(pattern[++i])
    else if (c === '%') out += '.*'
    else if (c === '_') out += '.'
    else out += plain(c)
  }
  return new RegExp(`^${out}$`, 'i')
}

function compare(orders: { col: string; asc: boolean; nullsFirst: boolean }[]) {
  return (a: Row, b: Row) => {
    for (const { col, asc, nullsFirst } of orders) {
      const x = a[col]
      const y = b[col]
      if (x == null && y == null) continue
      if (x == null) return nullsFirst ? -1 : 1
      if (y == null) return nullsFirst ? 1 : -1
      if (x === y) continue
      const result = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return asc ? result : -result
    }
    return 0
  }
}

type Mode = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

/** A tiny in-memory table store that answers the query shapes the app uses. */
function makeQuery(world: FakeWorld, tables: Record<string, Row[]>, calls: { table: string; mode: Mode; payload: unknown }[], table: string) {
  let mode: Mode = 'select'
  let payload: unknown
  let conflict: string[] = []
  const orders: { col: string; asc: boolean; nullsFirst: boolean }[] = []
  let one = false
  let wantCount = false
  let slice: [number, number] | null = null
  const filters: ((r: Row) => boolean)[] = []

  const run = () => {
    const rows = (tables[table] ??= [])
    let failure = mode !== 'select' ? world.failWrites[table] : world.failReads[table]
    if (mode !== 'select') {
      calls.push({ table, mode, payload })
      const nth = world.failNthWrite[table]
      if (nth && calls.filter((c) => c.table === table).length === nth.n) failure = nth.error
    }
    if (failure) return { data: null, error: failure }
    const match = (r: Row) => filters.every((f) => f(r))
    if (mode === 'insert') {
      for (const r of [payload].flat() as Row[]) rows.push({ id: `${table}-${rows.length + 1}`, ...r })
    } else if (mode === 'upsert') {
      for (const r of [payload].flat() as Row[]) {
        const found = rows.find((x) => conflict.every((k) => x[k] === r[k]))
        if (found) Object.assign(found, r)
        else rows.push({ ...r })
      }
    } else if (mode === 'update') {
      for (const r of rows.filter(match)) Object.assign(r, payload as Row)
    } else if (mode === 'delete') {
      tables[table] = rows.filter((r) => !match(r))
    } else {
      let found = rows.filter(match)
      if (orders.length) found = [...found].sort(compare(orders))
      const total = found.length
      if (slice) found = found.slice(slice[0], slice[1] + 1)
      return { data: one ? (found[0] ?? null) : found, error: null, count: wantCount ? total : null }
    }
    return { data: null, error: null }
  }

  const q = {
    select: (_columns?: string, opts?: { count?: string }) => ((wantCount = opts?.count === 'exact'), q),
    insert: (p: unknown) => ((mode = 'insert'), (payload = p), q),
    update: (p: unknown) => ((mode = 'update'), (payload = p), q),
    upsert: (p: unknown, opts?: { onConflict?: string }) => ((mode = 'upsert'), (payload = p), (conflict = (opts?.onConflict ?? 'id').split(',')), q),
    delete: () => ((mode = 'delete'), q),
    eq: (col: string, value: unknown) => (filters.push((r) => r[col] === value), q),
    is: (col: string, value: null) => (filters.push((r) => (r[col] ?? null) === value), q),
    neq: (col: string, value: unknown) => (filters.push((r) => r[col] !== value), q),
    in: (col: string, values: unknown[]) => (filters.push((r) => values.includes(r[col])), q),
    order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => (orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst ?? false }), q),
    ilike: (col: string, pattern: string) => (filters.push((r) => likeToRegExp(pattern).test(String(r[col] ?? ''))), q),
    contains: (col: string, values: unknown[]) => (filters.push((r) => Array.isArray(r[col]) && values.every((v) => (r[col] as unknown[]).includes(v))), q),
    range: (from: number, to: number) => ((slice = [from, to]), q),
    maybeSingle: () => ((one = true), Promise.resolve(run())),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
  }
  return q
}

/** A stand-in for the Supabase client with just the calls the app makes. */
export function makeFakeSupabase(initial: Partial<FakeWorld> = {}) {
  const world: FakeWorld = {
    session: null,
    appUser: { role: 'athlete', display_name: 'Pat Player' },
    athlete: { ...ATHLETE_ROW },
    signInError: null,
    signUpError: null,
    signUpSession: true,
    tables: {},
    failWrites: {},
    failReads: {},
    failNthWrite: {},
    ...initial,
  }
  const tables: Record<string, Row[]> = {
    ...structuredClone(LOOKUPS),
    app_user: world.appUser ? [{ user_id: 'user-1', ...world.appUser }] : [],
    athlete: world.athlete ? [{ ...ATHLETE_ROW, ...world.athlete }] : [],
    ...structuredClone(world.tables),
  }
  const calls: { table: string; mode: Mode; payload: unknown }[] = []
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
    from: vi.fn((table: string) => makeQuery(world, tables, calls, table)),
  }
  return { client, world, emit, tables, calls }
}
