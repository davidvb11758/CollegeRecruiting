import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { Button, Field, Message, SecondaryButton, SelectField, Splash } from '../components/ui'
import { useAuth } from '../lib/authContext'
import { friendlyDbError } from '../lib/dbErrors'
import { graduationYears } from '../lib/forms'
import { createAthlete, fetchLookups } from '../lib/profileApi'
import { createProfileSchema, type CreateProfileValues } from '../lib/profileSchemas'

/** First login for an athlete: the few facts needed to create the athlete record. The tabs on Profile hold the rest. */
export default function CreateProfile() {
  const { state, signOut, refresh } = useAuth()
  const lookups = useQuery({ queryKey: ['lookups'], queryFn: fetchLookups, staleTime: Infinity })
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateProfileValues>({ resolver: zodResolver(createProfileSchema) })

  const teams = lookups.data?.teams
  // With a single team there is nothing to choose, so it is filled in for the family.
  useEffect(() => {
    if (teams?.length === 1) setValue('teamId', teams[0].id)
  }, [teams, setValue])

  if (state.status !== 'signedIn') return null
  if (state.account.athleteId) return <Navigate to={created ? '/profile/personal' : '/home'} replace />
  if (lookups.isPending) return <Splash />

  const onSubmit = async (values: CreateProfileValues) => {
    setFormError(null)
    try {
      await createAthlete(state.account.userId, values)
      setCreated(true)
      refresh()
    } catch (error) {
      setFormError(friendlyDbError(error))
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Create your athlete profile</h1>
      <p className="text-sm text-muted">A few basics to start. You can add the rest on the Profile tab.</p>
      {lookups.isError && <Message kind="error">We could not load the lists. Check your connection and reload.</Message>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {(teams?.length ?? 0) <= 1 && <input type="hidden" {...register('teamId')} />}
        {teams && teams.length > 1 && (
          <SelectField label="Team" options={teams.map((t) => ({ value: t.id, label: t.name }))} placeholder="Choose" error={errors.teamId?.message} {...register('teamId')} />
        )}
        <Field label="Athlete first name" autoComplete="off" error={errors.firstName?.message} {...register('firstName')} />
        <Field label="Athlete last name" autoComplete="off" error={errors.lastName?.message} {...register('lastName')} />
        <Field label="Date of birth" type="date" hint="Athletes must be 14 to 18 years old." error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
        <SelectField label="Graduation year" options={graduationYears()} placeholder="Choose" error={errors.graduationYear?.message} {...register('graduationYear')} />
        <SelectField
          label="Home state"
          options={(lookups.data?.states ?? []).map((s) => ({ value: s.code, label: s.name }))}
          placeholder="Choose"
          error={errors.homeState?.message}
          {...register('homeState')}
        />
        {formError && <Message kind="error">{formError}</Message>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create profile'}
        </Button>
      </form>
      <SecondaryButton onClick={() => void signOut()}>Sign out</SecondaryButton>
    </main>
  )
}
