import { useQuery } from '@tanstack/react-query'
import { fetchHistory, fetchRoster } from './staffApi'

export const useRoster = () => useQuery({ queryKey: ['roster'], queryFn: fetchRoster })

export const useHistory = (athleteId: string) => useQuery({ queryKey: ['history', athleteId], queryFn: () => fetchHistory(athleteId) })
