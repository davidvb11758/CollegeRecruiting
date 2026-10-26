import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabase'

export type Row = Record<string, unknown>

export function client(): SupabaseClient {
  const supabase = getSupabase()
  if (!supabase) throw new Error('The app is not connected to a database')
  return supabase
}

/** supabase-js returns errors instead of throwing them; this makes every failure stop the work. */
export function ok<T>(result: { data?: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}
