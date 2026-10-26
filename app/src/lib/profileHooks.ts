import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { friendlyDbError } from './dbErrors'
import { fetchLookups, fetchProfile } from './profileApi'

export const profileKey = (athleteId: string) => ['profile', athleteId] as const

/** Everything on the athlete's profile, loaded together. Screens take an athlete id so staff can reuse them. */
export function useProfile(athleteId: string) {
  return useQuery({ queryKey: profileKey(athleteId), queryFn: () => fetchProfile(athleteId) })
}

export function useLookups() {
  return useQuery({ queryKey: ['lookups'], queryFn: fetchLookups, staleTime: Infinity })
}

/** One section's save: reloads the profile afterwards and exposes a readable error. */
export function useSectionSave<T>(athleteId: string, save: (values: T) => Promise<void>) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: save,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(athleteId) }),
  })
  return {
    save: mutation.mutateAsync,
    saving: mutation.isPending,
    saved: mutation.isSuccess,
    error: mutation.isError ? friendlyDbError(mutation.error) : null,
    reset: mutation.reset,
  }
}
