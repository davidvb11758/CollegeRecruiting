type DbErrorLike = { message?: string; code?: string; details?: string }

/** Turns a database error into a sentence the family can act on. */
export function friendlyDbError(error: unknown): string {
  const e = (error ?? {}) as DbErrorLike
  const message = (e.message ?? '').toLowerCase()

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Cannot reach the server. Check your connection and try again.'
  }
  if (message.includes('athletes must be 14 to 18')) return 'Athletes must be 14 to 18 years old.'
  if (message.includes('at most 2 guardians')) return 'You can add at most 2 parents or guardians.'
  if (message.includes('at most 3 video')) return 'You can add at most 3 video links.'
  if (message.includes('at most 3 intended majors')) return 'Choose at most 3 intended majors.'
  if (message.includes('list is limited to')) return 'Your list is full (30 colleges). Archive one before adding another.'
  if (e.code === '23505' && message.includes('athlete_college')) return 'This college is already on your list.'
  if (message.includes('only an administrator')) return 'Only an administrator can change assignments. Sign out and in again if your role has changed.'
  if (message.includes('not an active coordinator')) return 'That person is not an active coordinator, so they cannot be assigned. Refresh the page and choose someone else.'
  if (e.code === '23505' && message.includes('athlete_staff_assignment')) return 'That coordinator is already assigned to this athlete. Refresh the page.'
  if (e.code === '42501' || message.includes('row-level security') || message.includes('permission denied')) {
    return 'You do not have permission to save this. Sign out and in again, or contact your coordinator.'
  }
  if (e.code === '23505') return 'That entry already exists.'
  if (e.code === '23514') return 'One of the values is outside the allowed range. Check the highlighted fields.'
  if (e.code === '23502') return 'A required field is empty.'
  return `We could not save. Please try again.${e.code ? ` (${e.code})` : ''}`
}
