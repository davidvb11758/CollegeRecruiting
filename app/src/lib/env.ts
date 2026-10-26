import { z } from 'zod'

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
})

export type Env = z.infer<typeof schema>

/** Returns the validated public settings, or null when they are missing (the app still renders). */
export function readEnv(source: Record<string, unknown> = import.meta.env): Env | null {
  const parsed = schema.safeParse(source)
  return parsed.success ? parsed.data : null
}
