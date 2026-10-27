import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { friendlyDbError } from './dbErrors'
import { fetchMasterRecord } from './masterApi'

export const useMasterRecord = (programId: number, enabled = true) =>
  useQuery({ queryKey: ['master', programId], queryFn: () => fetchMasterRecord(programId), enabled })

/** Screens that show college data and must reload after a coordinator changes it. */
const MASTER_KEYS = ['master', 'college', 'search', 'hub', 'mylist']

/** One edit to the shared college data. Afterwards every screen that shows it reloads. */
export function useMasterWrite<T>(write: (values: T) => Promise<void>) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: write,
    onSuccess: () => Promise.all(MASTER_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  })
  return {
    run: mutation.mutateAsync,
    pending: mutation.isPending,
    saved: mutation.isSuccess,
    error: mutation.isError ? friendlyDbError(mutation.error) : null,
    reset: mutation.reset,
  }
}
