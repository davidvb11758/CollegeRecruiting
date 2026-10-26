import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readEnv } from './env'

let client: SupabaseClient | null = null

/** The one Supabase client. Uses the public key only; row-level security does the protecting. */
export function getSupabase(): SupabaseClient | null {
  if (client) return client
  const env = readEnv()
  if (!env) return null
  client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  return client
}
