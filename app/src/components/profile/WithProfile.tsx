import type { ReactNode } from 'react'
import { useLookups, useProfile } from '../../lib/profileHooks'
import type { Lookups, ProfileBundle } from '../../lib/profileApi'
import { Button, Message } from '../ui'

/** Loads the profile and the pick-lists, then hands them to a section. Every section takes an athlete id. */
export default function WithProfile({
  athleteId,
  children,
}: {
  athleteId: string
  children: (profile: ProfileBundle, lookups: Lookups) => ReactNode
}) {
  const profile = useProfile(athleteId)
  const lookups = useLookups()
  if (profile.isPending || lookups.isPending) {
    return (
      <p role="status" className="text-muted">
        Loading…
      </p>
    )
  }
  if (!profile.data || !lookups.data) {
    return (
      <div className="flex flex-col gap-3">
        <Message kind="error">We could not load this section.</Message>
        <Button
          onClick={() => {
            void profile.refetch()
            void lookups.refetch()
          }}
        >
          Try again
        </Button>
      </div>
    )
  }
  return <>{children(profile.data, lookups.data)}</>
}
