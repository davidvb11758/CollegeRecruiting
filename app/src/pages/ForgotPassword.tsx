import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { AuthPage, Button, Field, Message } from '../components/ui'
import { friendlyAuthError } from '../lib/authErrors'
import { forgotPasswordSchema, type ForgotPasswordValues } from '../lib/authSchemas'
import { getSupabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) })

  const onSubmit = async (values: ForgotPasswordValues) => {
    setFormError(null)
    const supabase = getSupabase()
    if (!supabase) return
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) setFormError(friendlyAuthError(error, 'reset'))
    else setSent(true)
  }

  return (
    <AuthPage title="Reset your password">
      {sent ? (
        // Same answer whether or not the email has an account, so this page cannot be used to find accounts.
        <Message kind="info">If that email has an account, we sent a link to reset the password. Check your inbox.</Message>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            error={errors.email?.message}
            {...register('email')}
          />
          {formError && <Message kind="error">{formError}</Message>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <Link to="/sign-in" className="text-sm text-red-900 underline">
        Back to sign in
      </Link>
    </AuthPage>
  )
}
