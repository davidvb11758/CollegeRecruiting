export type AuthAction = 'signIn' | 'signUp' | 'reset' | 'newPassword'

type AuthErrorLike = { message?: string; code?: string; status?: number }

/**
 * Turns an auth error into a sentence for the family. Sign-in never says whether the email exists:
 * a wrong password and an unknown email give the same message.
 */
export function friendlyAuthError(error: AuthErrorLike, action: AuthAction): string {
  const message = (error.message ?? '').toLowerCase()
  const code = error.code ?? ''

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Cannot reach the server. Check your connection and try again.'
  }
  if (error.status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return 'Too many attempts. Wait a few minutes and try again.'
  }

  switch (action) {
    case 'signIn':
      if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
        return 'That email and password do not match. Check them, or reset your password.'
      }
      break
    case 'signUp':
      if (code === 'email_address_invalid' || message.includes('email address') && message.includes('invalid')) {
        return 'That email address was not accepted. Check it for typos or use a different address.'
      }
      if (code === 'signup_disabled') return 'Sign-ups are turned off right now. Contact your Rockets recruiting coordinator.'
      if (message.includes('sending') && message.includes('email')) {
        return 'We could not send the confirmation email. Try again later or contact your Rockets recruiting coordinator.'
      }
      if (message.includes('invalid sign-up code')) {
        return 'That sign-up code is not right. Ask your Rockets recruiting coordinator for the current code.'
      }
      if (message.includes('acknowledg')) return 'Tick the box to continue.'
      if (code === 'user_already_exists' || message.includes('already registered')) {
        return 'An account with that email may already exist. Try signing in, or reset your password. Each athlete needs a different email.'
      }
      if (code === 'weak_password' || message.includes('password')) {
        return 'That password is too weak. Use at least 8 characters.'
      }
      // The sign-up code check is the only rule that stops a new login, and the server hides its details.
      if (message.includes('database error saving new user')) {
        return 'We could not create the account. Check the sign-up code and try again.'
      }
      break
    case 'newPassword':
      if (code === 'same_password') return 'Choose a password you have not used before.'
      if (code === 'weak_password') return 'That password is too weak. Use at least 8 characters.'
      if (message.includes('session')) return 'This link has expired. Request a new reset link.'
      break
    case 'reset':
      break
  }
  // Show the server's code so a family can read it out to the coordinator; it holds nothing private.
  const detail = [error.status, code].filter(Boolean).join(' ')
  return `Something went wrong. Please try again.${detail ? ` (${detail})` : ''}`
}
