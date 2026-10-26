import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { friendlyDbError } from './dbErrors'
import {
  fetchActivity,
  fetchActivityTypes,
  fetchHome,
  fetchListHub,
  fetchMyList,
  fetchNextSteps,
  fetchStepTypes,
} from './listApi'

export const useMyList = (athleteId: string) =>
  useQuery({ queryKey: ['mylist', athleteId], queryFn: () => fetchMyList(athleteId) })

export const useListHub = (listId: string, athleteId: string) =>
  useQuery({ queryKey: ['hub', listId], queryFn: () => fetchListHub(listId, athleteId) })

export const useActivity = (listId: string) => useQuery({ queryKey: ['activity', listId], queryFn: () => fetchActivity(listId) })

export const useNextSteps = (listId: string) => useQuery({ queryKey: ['steps', listId], queryFn: () => fetchNextSteps(listId) })

export const useHome = (athleteId: string) => useQuery({ queryKey: ['home', athleteId], queryFn: () => fetchHome(athleteId) })

export const useActivityTypes = () => useQuery({ queryKey: ['activity-types'], queryFn: fetchActivityTypes, staleTime: Infinity })

export const useStepTypes = () => useQuery({ queryKey: ['step-types'], queryFn: fetchStepTypes, staleTime: Infinity })

const LIST_KEYS = ['mylist', 'hub', 'activity', 'steps', 'home', 'list-entries', 'search']

/**
 * A write to the list, the log, a next step or a contact. Afterwards every screen that shows list data reloads, because
 * one change can touch several of them (a stage change adds a system entry; finishing a step changes Home).
 */
export function useListWrite<T>(write: (values: T) => Promise<void>) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: write,
    onSuccess: () => Promise.all(LIST_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  })
  return {
    run: mutation.mutateAsync,
    pending: mutation.isPending,
    saved: mutation.isSuccess,
    error: mutation.isError ? friendlyDbError(mutation.error) : null,
    reset: mutation.reset,
  }
}
