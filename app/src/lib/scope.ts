import { createContext, useContext } from 'react'

/**
 * Where the athlete screens live. Athletes see them at the top level ("/list"); a coordinator sees the same screens
 * for one athlete under "/staff/athlete/<id>". Links inside the screens add the prefix, so nothing is copied.
 */
export type Scope = {
  prefix: string
  /** True when a coordinator is looking at an athlete's screens (wording changes from "you" to "the athlete"). */
  staffView: boolean
}

export const ScopeContext = createContext<Scope>({ prefix: '', staffView: false })

export const useScope = (): Scope => useContext(ScopeContext)

export const staffAthletePrefix = (athleteId: string) => `/staff/athlete/${athleteId}`
