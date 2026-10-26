export const STAGE_OPTIONS = [
  { value: 'researching', label: 'Researching' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'in_conversation', label: 'In conversation' },
  { value: 'camp_visit', label: 'Camp or visit' },
  { value: 'offer', label: 'Offer' },
  { value: 'committed', label: 'Committed' },
  { value: 'closed', label: 'Closed' },
]

export const PRIORITY_OPTIONS = [
  { value: '1', label: '1 - Top choice' },
  { value: '2', label: '2 - Strong target' },
  { value: '3', label: '3 - Good fit' },
  { value: '4', label: '4 - Backup' },
]

export const CLOSED_REASON_OPTIONS = [
  { value: 'i_passed', label: 'I passed' },
  { value: 'college_passed', label: 'The college passed' },
  { value: 'no_response', label: 'No response' },
  { value: 'other', label: 'Other' },
]

export const OUTCOME_OPTIONS = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
  { value: 'waiting', label: 'Waiting for reply' },
]

export const DIRECTION_OPTIONS = [
  { value: 'i_contacted', label: 'I contacted them' },
  { value: 'they_contacted', label: 'They contacted me' },
  { value: 'not_applicable', label: 'Not applicable' },
]

export const COACH_TITLE_OPTIONS = [
  { value: 'head', label: 'Head coach' },
  { value: 'associate_head', label: 'Associate head coach' },
  { value: 'assistant', label: 'Assistant coach' },
  { value: 'recruiting_coordinator', label: 'Recruiting coordinator' },
  { value: 'director_ops', label: 'Director of operations' },
  { value: 'other', label: 'Other' },
]

const find = (options: { value: string; label: string }[], value: unknown) =>
  options.find((o) => o.value === String(value))?.label ?? ''

export const stageLabel = (v: unknown) => find(STAGE_OPTIONS, v)
export const priorityLabel = (v: unknown) => find(PRIORITY_OPTIONS, v)
export const outcomeLabel = (v: unknown) => find(OUTCOME_OPTIONS, v)
export const directionLabel = (v: unknown) => find(DIRECTION_OPTIONS, v)

/** Stages where a college is no longer being pursued, so "no activity" is not a worry. */
export const SETTLED_STAGES = ['closed', 'committed']

/** The activity type a finished next step most likely produced, to pre-fill "Log it?". */
export const ACTIVITY_FOR_STEP: Record<string, string> = {
  send_email: 'email',
  follow_up: 'email',
  call: 'phone_call',
  send_video: 'email',
  register_camp: 'camp_clinic',
  plan_visit: 'campus_visit',
  thank_you: 'email',
}

export const DIVISION_SHORT: Record<string, string> = {
  NCAA_D1: 'NCAA D1',
  NCAA_D2: 'NCAA D2',
  NCAA_D3: 'NCAA D3',
  NAIA: 'NAIA',
  NJCAA: 'NJCAA',
}
