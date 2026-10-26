import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { friendlyAuthError } from '../lib/authErrors'
import { newPasswordSchema, type NewPasswordValues } from '../lib/authSchemas'
import { getSupabase } from '../lib/supabase'
import { Button, Field, Message } from './ui'

/** Sets a new password for the signed-in session. Used after a reset link and from the account page. */
export default function NewPasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone?: () => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema) })

  const onSubmit = async (values: NewPasswordValues) => {
    setFormError(null)
    setSaved(false)
    const supabase = getSupabase()
    if (!supabase) return
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      setFormError(friendlyAuthError(error, 'newPassword'))
      return
    }
    reset()
    setSaved(true)
    onDone?.()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errors.password?.message}
        {...register('password')}
      />
      <Field
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register('confirm')}
      />
      {formError && <Message kind="error">{formError}</Message>}
      {saved && <Message kind="info">Your password was changed.</Message>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}
