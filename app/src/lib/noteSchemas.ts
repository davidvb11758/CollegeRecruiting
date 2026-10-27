import { z } from 'zod'

/** A note or question to the other side of the conversation (the athlete to their coordinators, or a coordinator to the athlete). */
export const noteSchema = z.object({
  kind: z.enum(['note', 'question']),
  body: z.string().trim().min(1, 'Write your note').max(1000, 'Use 1000 characters or fewer'),
})

export type NoteValues = z.infer<typeof noteSchema>
