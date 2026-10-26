import { z } from 'zod'
import { clubToday } from './dates'
import { maxText, optionalEmail, optionalUrl } from './forms'

const optionalText = (max = 120) => z.string().trim().max(max, `Use ${max} characters or fewer`)

/** The overview tab. A closed college needs a reason; any other stage must not have one. */
export const overviewSchema = z
  .object({
    priority: z.enum(['1', '2', '3', '4']),
    stage: z.enum(['researching', 'shortlisted', 'contacted', 'in_conversation', 'camp_visit', 'offer', 'committed', 'closed']),
    closedReason: z.enum(['', 'i_passed', 'college_passed', 'no_response', 'other']),
    mainCoachId: z.string(),
    whyILikeText: maxText('This note', 2000),
    notesText: maxText('Notes', 5000),
    questionnaireDone: z.boolean(),
  })
  .refine((d) => d.stage !== 'closed' || d.closedReason !== '', { path: ['closedReason'], message: 'Choose why this college is closed' })

/** Logging an activity. Direction is checked in the form because it depends on the type. */
export const activitySchema = z.object({
  activityDate: z
    .string()
    .min(1, 'Enter the date')
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), 'Enter a valid date')
    .refine((v) => v <= clubToday(), 'The date cannot be in the future')
    .refine((v) => v >= '2020-01-01', 'The date is too far in the past'),
  activityTime: z.string(),
  activityTypeCode: z.string().min(1, 'Choose what happened'),
  direction: z.enum(['', 'i_contacted', 'they_contacted', 'not_applicable']),
  coachId: z.string(),
  coachNameText: optionalText(80),
  summary: z.string().trim().min(1, 'Write a one-line summary').max(200, 'Use 200 characters or fewer'),
  detailsText: maxText('Details', 4000),
  outcome: z.enum(['', 'positive', 'neutral', 'negative', 'waiting']),
  followUpNeeded: z.boolean(),
  attachmentUrl: optionalUrl,
})

export const nextStepSchema = z.object({
  stepTypeCode: z.string(),
  description: z.string().trim().min(1, 'Say what to do').max(200, 'Use 200 characters or fewer'),
  dueDate: z
    .string()
    .min(1, 'Choose a due date')
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), 'Enter a valid date'),
})

export const coachContactSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter the name').max(80, 'Use 80 characters or fewer'),
  title: z.enum(['head', 'associate_head', 'assistant', 'recruiting_coordinator', 'director_ops', 'other']),
  email: optionalEmail,
  phone: optionalText(30),
  note: optionalText(300),
})

export type OverviewValues = z.infer<typeof overviewSchema>
export type ActivityValues = z.infer<typeof activitySchema>
export type NextStepValues = z.infer<typeof nextStepSchema>
export type CoachContactValues = z.infer<typeof coachContactSchema>
