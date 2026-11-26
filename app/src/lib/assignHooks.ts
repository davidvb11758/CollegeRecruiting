import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAssignmentData } from './assignApi'
import { friendlyDbError } from './dbErrors'

export const useAssignmentData = () => useQuery({ queryKey: ['assignments'], queryFn: fetchAssignmentData })

/** A change to the assignments. Afterwards the screen reloads, so it always shows what the database now holds. */
export function useAssignmentWrite<T>(write: (values: T) => Promise<void>) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: write,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assignments'] }),
  })
  return {
    run: mutation.mutateAsync,
    pending: mutation.isPending,
    error: mutation.isError ? friendlyDbError(mutation.error) : null,
  }
}
