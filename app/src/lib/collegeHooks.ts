import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addToList, fetchCollegeDetail, fetchConferences, fetchListEntries, PAGE_SIZE, restoreToList, searchPrograms } from './collegeApi'
import { friendlyDbError } from './dbErrors'
import type { Filters } from './findFilters'

export function useSearch(filters: Filters) {
  return useInfiniteQuery({
    queryKey: ['search', filters],
    queryFn: ({ pageParam }) => searchPrograms(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (pages.length * PAGE_SIZE < last.count ? pages.length : undefined),
  })
}

export function useConferences() {
  return useQuery({ queryKey: ['conferences'], queryFn: fetchConferences, staleTime: Infinity })
}

export function useCollegeDetail(programId: number, athleteId: string | null) {
  return useQuery({ queryKey: ['college', programId, athleteId], queryFn: () => fetchCollegeDetail(programId, athleteId) })
}

export const listKey = (athleteId: string) => ['list-entries', athleteId] as const

/** Which colleges are on the athlete's list. Without an athlete (staff browsing) there is nothing to load. */
export function useListEntries(athleteId: string | null) {
  return useQuery({
    queryKey: listKey(athleteId ?? ''),
    queryFn: () => fetchListEntries(athleteId as string),
    enabled: athleteId !== null,
  })
}

export function useAddToList(athleteId: string) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (input: { programId: number; archivedEntryId?: string }) => {
      if (input.archivedEntryId) await restoreToList(input.archivedEntryId)
      else await addToList(athleteId, input.programId)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey(athleteId) }),
  })
  return {
    add: mutation.mutateAsync,
    adding: mutation.isPending,
    added: mutation.isSuccess,
    error: mutation.isError ? friendlyDbError(mutation.error) : null,
  }
}
