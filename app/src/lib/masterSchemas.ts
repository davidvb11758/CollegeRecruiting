import { z } from 'zod'
import { optionalEmail, optionalUrl } from './forms'

const text = (label: string, max: number) => z.string().trim().max(max, `${label} can be at most ${max} characters`)

/** The college and volleyball-program facts a coordinator can correct. Everything else comes from the source files. */
export const collegeEditSchema = z.object({
  programUrl: optionalUrl,
  questionnaireUrl: optionalUrl,
  campsUrl: optionalUrl,
  instagramUrl: optionalUrl,
  xUrl: optionalUrl,
  lastSeasonRecord: text('Last season', 40),
  websiteUrl: optionalUrl,
  costUrl: optionalUrl,
  status: z.enum(['active', 'program_dropped', 'needs_review']),
})

/** A shared (master) coach record. A departed coach cannot be the main recruiting contact. */
export const coachEditSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Enter the name').max(80, 'Use 80 characters or fewer'),
    title: z.enum(['head', 'associate_head', 'assistant', 'recruiting_coordinator', 'director_ops', 'other']),
    email: optionalEmail,
    phone: text('Phone', 30),
    staffPageUrl: optionalUrl,
    recruitsNote: text('Note', 300),
    employmentStatus: z.enum(['current', 'departed', 'unknown']),
    isPrimary: z.boolean(),
  })
  .refine((d) => !(d.isPrimary && d.employmentStatus === 'departed'), {
    path: ['isPrimary'],
    message: 'A coach who has left cannot be the main recruiting contact',
  })

export type CollegeEditValues = z.infer<typeof collegeEditSchema>
export type CoachEditValues = z.infer<typeof coachEditSchema>

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active program' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'program_dropped', label: 'Program dropped (hide from search)' },
]

export const EMPLOYMENT_OPTIONS = [
  { value: 'current', label: 'Current' },
  { value: 'unknown', label: 'Not sure' },
  { value: 'departed', label: 'Left the program' },
]
