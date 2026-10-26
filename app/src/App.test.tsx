import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { CONSENT_TEXT } from './lib/consent'
import { makeFakeSupabase, makeSession, type FakeWorld } from './test/fakeSupabase'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('./lib/supabase', () => ({ getSupabase: () => mocked.client }))

function start(path: string, world: Partial<FakeWorld> = {}) {
  const fake = makeFakeSupabase(world)
  mocked.client = fake.client
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  return fake
}

const signedIn = { session: makeSession() }

describe('routing and role guards', () => {
  it('sends a signed-out visitor to sign-in', async () => {
    start('/')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('sends a signed-out visitor away from a signed-in page', async () => {
    start('/list')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows not-found for unknown pages', async () => {
    start('/nope')
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
  })

  it('shows an athlete with a profile their home page and a five-item bottom bar', async () => {
    start('/', signedIn)
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(Array.from(nav.querySelectorAll('a')).map((a) => a.textContent)).toEqual(['Home', 'My List', 'Find', 'Profile', 'More'])
  })

  it('sends an athlete with no athlete record to the create-profile step', async () => {
    start('/home', { ...signedIn, athlete: null })
    expect(await screen.findByRole('heading', { name: /create your athlete profile/i })).toBeInTheDocument()
  })

  it('shows staff the roster with a top bar, and keeps them out of athlete pages', async () => {
    start('/home', { ...signedIn, appUser: { role: 'staff', display_name: 'Coach' }, athlete: null })
    expect(await screen.findByRole('heading', { name: 'Roster' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My List' })).not.toBeInTheDocument()
  })

  it('keeps an athlete out of the staff area', async () => {
    start('/staff', signedIn)
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('bounces a disabled account back to sign-in with a message', async () => {
    const { client } = start('/home', { ...signedIn, appUser: null })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/not active/i)
    expect(client.auth.signOut).toHaveBeenCalled()
  })

  it('explains an unrequested sign-out as an ended session', async () => {
    const { emit } = start('/home', signedIn)
    await screen.findByRole('heading', { name: 'Home' })
    act(() => emit('SIGNED_OUT', null))
    expect(await screen.findByRole('heading', { name: /signed out/i })).toBeInTheDocument()
  })

  it('goes to the password page when a reset link is opened', async () => {
    const { emit } = start('/sign-in')
    await screen.findByRole('heading', { name: 'Sign in' })
    act(() => emit('PASSWORD_RECOVERY', makeSession()))
    expect(await screen.findByRole('heading', { name: /choose a new password/i })).toBeInTheDocument()
  })

  it('says a reset link is expired when nobody is signed in', async () => {
    start('/reset-password')
    expect(await screen.findByText(/expired or was already used/i)).toBeInTheDocument()
  })
})

describe('sign in', () => {
  it('gives the same message for a wrong password and an unknown email', async () => {
    const user = userEvent.setup()
    start('/sign-in', { signInError: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 } })
    await screen.findByRole('heading', { name: 'Sign in' })
    await user.type(screen.getByLabelText('Email'), 'nobody@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password do not match')
    expect(screen.getByRole('alert')).not.toHaveTextContent(/no account|not registered|unknown/i)
  })

  it('opens the home page after a successful sign-in', async () => {
    const user = userEvent.setup()
    start('/sign-in')
    await screen.findByRole('heading', { name: 'Sign in' })
    await user.type(screen.getByLabelText('Email'), 'family@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('signs out from the More tab', async () => {
    const user = userEvent.setup()
    start('/more', signedIn)
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('sign up', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, opts: { consent: boolean }) {
    await screen.findByRole('heading', { name: /create your account/i })
    await user.type(screen.getByLabelText('Your name'), 'Pat Player')
    await user.type(screen.getByLabelText('Email'), 'pat@example.com')
    await user.type(screen.getByLabelText('Password'), 'long-enough-1')
    await user.type(screen.getByLabelText('Confirm password'), 'long-enough-1')
    await user.type(screen.getByLabelText('Sign-up code'), 'ROCKETS-CODE')
    if (opts.consent) await user.click(screen.getByLabelText(CONSENT_TEXT))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
  }

  it('will not submit without the acknowledgement', async () => {
    const user = userEvent.setup()
    const { client } = start('/sign-up')
    await fill(user, { consent: false })
    expect(await screen.findByText('Tick the box to continue')).toBeInTheDocument()
    expect(client.auth.signUp).not.toHaveBeenCalled()
  })

  it('sends the code and acknowledgement as sign-up data, then lands on the create-profile step', async () => {
    const user = userEvent.setup()
    const { client } = start('/sign-up', { athlete: null })
    await fill(user, { consent: true })
    expect(await screen.findByRole('heading', { name: /create your athlete profile/i })).toBeInTheDocument()
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'pat@example.com',
      password: 'long-enough-1',
      options: { data: { pilot_code: 'ROCKETS-CODE', acknowledged: true, display_name: 'Pat Player' } },
    })
  })

  it('shows a readable message when the server refuses the code', async () => {
    const user = userEvent.setup()
    // This is what the live server returns for a wrong code: the trigger's own message is hidden.
    start('/sign-up', { signUpError: { message: 'Database error saving new user', status: 500 } })
    await fill(user, { consent: true })
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the sign-up code and try again')
  })

  it('asks for the email link when the server does not sign the person in', async () => {
    const user = userEvent.setup()
    start('/sign-up', { signUpSession: false })
    await fill(user, { consent: true })
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument()
  })
})

describe('forgot password', () => {
  it('gives the same answer for any email', async () => {
    const user = userEvent.setup()
    const { client } = start('/forgot-password')
    await screen.findByRole('heading', { name: /reset your password/i })
    await user.type(screen.getByLabelText('Email'), 'whoever@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/if that email has an account/i))
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('whoever@example.com', {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  })
})

describe('change password', () => {
  it('checks the two passwords match before saving', async () => {
    const user = userEvent.setup()
    const { client } = start('/more', signedIn)
    await user.type(await screen.findByLabelText('New password'), 'another-long-1')
    await user.type(screen.getByLabelText('Confirm new password'), 'different-long-2')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('The two passwords do not match')).toBeInTheDocument()
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })

  it('saves a valid new password', async () => {
    const user = userEvent.setup()
    const { client } = start('/more', signedIn)
    await user.type(await screen.findByLabelText('New password'), 'another-long-1')
    await user.type(screen.getByLabelText('Confirm new password'), 'another-long-1')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Your password was changed.')).toBeInTheDocument()
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'another-long-1' })
  })
})
