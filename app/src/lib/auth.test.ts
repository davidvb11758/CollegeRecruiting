import { friendlyAuthError } from './authErrors'
import { signUpSchema } from './authSchemas'

const valid = {
  displayName: 'Pat Player',
  email: 'pat@example.com',
  password: 'long-enough-1',
  confirm: 'long-enough-1',
  pilotCode: 'CODE',
  acknowledged: true,
}

describe('sign-up rules', () => {
  it('accepts a complete form', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['a short password', { password: 'short', confirm: 'short' }],
    ['passwords that differ', { confirm: 'something-else-1' }],
    ['a missing code', { pilotCode: '  ' }],
    ['an unticked acknowledgement', { acknowledged: false }],
    ['a bad email', { email: 'not-an-email' }],
    ['no name', { displayName: '' }],
  ])('rejects %s', (_label, change) => {
    expect(signUpSchema.safeParse({ ...valid, ...change }).success).toBe(false)
  })

  it('trims the email', () => {
    const parsed = signUpSchema.parse({ ...valid, email: '  pat@example.com ' })
    expect(parsed.email).toBe('pat@example.com')
  })
})

describe('friendly auth errors', () => {
  it('does not reveal whether an email exists on sign-in', () => {
    const wrongPassword = friendlyAuthError({ message: 'Invalid login credentials', code: 'invalid_credentials' }, 'signIn')
    const unknownEmail = friendlyAuthError({ message: 'Invalid login credentials', code: 'invalid_credentials' }, 'signIn')
    expect(wrongPassword).toBe(unknownEmail)
    expect(wrongPassword).not.toMatch(/exist|registered|found/i)
  })

  it('explains a bad sign-up code', () => {
    expect(friendlyAuthError({ message: 'Invalid sign-up code' }, 'signUp')).toMatch(/sign-up code is not right/)
  })

  it('explains a hidden trigger failure as a code problem', () => {
    expect(friendlyAuthError({ message: 'Database error saving new user' }, 'signUp')).toMatch(/Check the sign-up code/)
  })

  it('explains rate limits and network failures', () => {
    expect(friendlyAuthError({ message: 'x', status: 429 }, 'signIn')).toMatch(/Too many attempts/)
    expect(friendlyAuthError({ message: 'Failed to fetch' }, 'signIn')).toMatch(/Cannot reach the server/)
  })

  it('falls back to a plain sentence', () => {
    expect(friendlyAuthError({ message: 'weird' }, 'reset')).toBe('Something went wrong. Please try again.')
  })
})
