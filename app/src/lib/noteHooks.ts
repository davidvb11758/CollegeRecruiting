import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { friendlyDbError } from './dbErrors'
import { fetchInbox, fetchThread } from './noteApi'

export const useInbox = () => useQuery({ queryKey: ['inbox'], queryFn: fetchInbox })

export const useThread = (athleteId: string) => useQuery({ queryKey: ['thread', athleteId], queryFn: () => fetchThread(athleteId) })

/** A write to the notes. Afterwards the inbox on the home screens and the conversation reload. */
export function useNoteWrite<T>(write: (values: T) => Promise<void>) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: write,
    onSuccess: () => Promise.all(['inbox', 'thread'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  })
  return {
    run: mutation.mutateAsync,
    pending: mutation.isPending,
    saved: mutation.isSuccess,
    error: mutation.isError ? friendlyDbError(mutation.error) : null,
    reset: mutation.reset,
  }
}
