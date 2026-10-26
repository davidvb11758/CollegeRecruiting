import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { AuthPage, Button, Field, Message } from '../components/ui'
import { useAuth } from '../lib/authContext'
import { friendlyAuthError } from '../lib/authErrors'
import { signInSchema, type SignInValues } from '../lib/authSchemas'
import { getSupabase } from '../lib/supabase'

export default function SignIn() {
  const { state, notice } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) })

  const onSubmit = async (values: SignInValues) => {
    setFormError(null)
    const supabase = getSupabase()
    if (!supabase) return
    const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password })
    // On success the auth state changes and the route sends the person to their home page.
    if (error) setFormError(friendlyAuthError(error, 'signIn'))
  }

  return (
    <AuthPage title="Sign in">
      {state.status === 'unconfigured' && <Message kind="error">This app is not connected to a database yet.</Message>}
      {notice === 'disabled' && (
        <Message kind="error">This account is not active. Contact your Rockets recruiting coordinator.</Message>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {formError && <Message kind="error">{formError}</Message>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="flex flex-col gap-2 text-sm">
        <Link to="/forgot-password" className="text-red-900 underline">
          Forgot your password?
        </Link>
        <span>
          New here?{' '}
          <Link to="/sign-up" className="text-red-900 underline">
            Create an account
          </Link>
        </span>
      </p>
    </AuthPage>
  )
}
