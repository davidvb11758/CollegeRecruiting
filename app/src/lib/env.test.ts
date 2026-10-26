import { readEnv } from './env'

describe('readEnv', () => {
  it('returns null when settings are missing', () => {
    expect(readEnv({})).toBeNull()
  })

  it('returns the settings when valid', () => {
    const env = readEnv({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'x'.repeat(30),
    })
    expect(env?.VITE_SUPABASE_URL).toBe('https://abc.supabase.co')
  })
})
