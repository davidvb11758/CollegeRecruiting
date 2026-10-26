import { z } from 'zod'
import { MIN_PASSWORD_LENGTH } from './consent'

const email = z.string().trim().pipe(z.email('Enter a valid email address'))

const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(72, 'Use 72 characters or fewer')

const samePasswords = (d: { password: string; confirm: string }) => d.password === d.confirm
const mismatch = { path: ['confirm'], message: 'The two passwords do not match' }

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
})

export const signUpSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Enter your name').max(80, 'Use 80 characters or fewer'),
    email,
    password: newPassword,
    confirm: z.string(),
    pilotCode: z.string().trim().min(1, 'Enter the sign-up code from your coordinator'),
    acknowledged: z.boolean().refine((v) => v, 'Tick the box to continue'),
  })
  .refine(samePasswords, mismatch)

export const forgotPasswordSchema = z.object({ email })

export const newPasswordSchema = z.object({ password: newPassword, confirm: z.string() }).refine(samePasswords, mismatch)

export type SignInValues = z.infer<typeof signInSchema>
export type SignUpValues = z.infer<typeof signUpSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type NewPasswordValues = z.infer<typeof newPasswordSchema>
