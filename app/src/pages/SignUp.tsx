import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { AuthPage, Button, CheckboxField, Field, Message } from '../components/ui'
import { friendlyAuthError } from '../lib/authErrors'
import { signUpSchema, type SignUpValues } from '../lib/authSchemas'
import { CONSENT_TEXT } from '../lib/consent'
import { getSupabase } from '../lib/supabase'

export default function SignUp() {
  const [formError, setFormError] = useState<string | null>(null)
  const [needsEmail, setNeedsEmail] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema), defaultValues: { acknowledged: false } })

  const onSubmit = async (values: SignUpValues) => {
    setFormError(null)
    const supabase = getSupabase()
    if (!supabase) return
    // The database checks the code and the acknowledgement; this is also why the server, not this form, is the gate.
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { pilot_code: values.pilotCode, acknowledged: values.acknowledged, display_name: values.displayName },
      },
    })
    if (error) {
      console.error('Sign-up failed', error)
      setFormError(friendlyAuthError(error, 'signUp'))
      return
    }
    // Signed in at once (email confirmation is off in the pilot). If a session did not come back, ask for the email.
    if (!data.session) setNeedsEmail(true)
  }

  if (needsEmail) {
    return (
      <AuthPage title="Check your email">
        <Message kind="info">We sent a link to confirm your email. Open it on this device, then sign in.</Message>
        <Link to="/sign-in" className="text-gold underline">
          Back to sign in
        </Link>
      </AuthPage>
    )
  }

  return (
    <AuthPage title="Create your account">
      <p className="text-sm text-muted">
        You need the sign-up code from your Rockets recruiting coordinator. Each athlete needs their own email address.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Field label="Your name" autoComplete="name" error={errors.displayName?.message} {...register('displayName')} />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          error={errors.password?.message}
          {...register('password')}
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <Field
          label="Sign-up code"
          autoComplete="off"
          autoCapitalize="none"
          error={errors.pilotCode?.message}
          {...register('pilotCode')}
        />
        <CheckboxField label={CONSENT_TEXT} error={errors.acknowledged?.message} {...register('acknowledged')} />
        {formError && <Message kind="error">{formError}</Message>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="text-sm">
        Already have an account?{' '}
        <Link to="/sign-in" className="text-gold underline">
          Sign in
        </Link>
      </p>
    </AuthPage>
  )
}
