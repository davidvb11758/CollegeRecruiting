# Supabase Auth settings (set in the dashboard, per project)

These live in the Supabase dashboard, not in migrations. Do them on **DEV** now and repeat on **PROD** at go-live.
Dashboard: **Authentication**.

## 1. Sign-in method (Sign In / Providers → Email)

| Setting | Value | Why |
|---|---|---|
| Email provider | On | Email sign-in (decision P1) |
| Confirm email | **Off** | Pilot decision: no email confirmation (the shared sign-up code is the gate). The app also copes if this is left on: it then shows "Check your email". |
| Minimum password length | 8 | Matches the sign-up and change-password forms |
| Anonymous sign-ins | Off | |
| Allow new users to sign up | On | The database trigger refuses anyone without the code |

## 2. URL configuration

- **Site URL:** the live address (the Cloudflare Pages URL), or `http://localhost:5173` while only testing locally.
- **Redirect URLs:** add `<site>/reset-password` for each address in use, e.g. `http://localhost:5173/reset-password` and `https://<your-pages-domain>/reset-password`.

Without the redirect URL the reset email's link lands on the wrong page.

## 3. Email sending (SMTP) — needed for password reset

Supabase's built-in sender only mails project members and is limited to a few emails an hour, so password reset needs a real sender (decision P5: Resend).

1. In Resend, verify the club's sending domain and create an API key.
2. Authentication → Emails → SMTP Settings → enable custom SMTP:
   - Host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key
   - Sender address on the verified domain (for example `no-reply@<your-domain>`), sender name `Rockets College Recruiting`
3. Never put the Resend key in the app or in git.

## 4. Email template wording (Authentication → Emails → Templates)

**Reset password**

- Subject: `Reset your Rockets College Recruiting password`
- Body:

  ```html
  <h2>Reset your password</h2>
  <p>Someone asked to reset the password for your Rockets College Recruiting account.</p>
  <p><a href="{{ .ConfirmationURL }}">Choose a new password</a></p>
  <p>If you did not ask for this, ignore this email. Your password stays the same.</p>
  ```

**Confirm sign up** is not sent in the pilot (Confirm email is off). If it is ever turned on, reuse the same style with the subject `Confirm your Rockets College Recruiting email`.

## 5. Check after changing

- Sign up with the pilot code → you land on "Create your athlete profile" with no email step.
- "Forgot your password?" → the email arrives → the link opens "Choose a new password" → saving signs you in.
- Sign up with a wrong code → "We could not create the account. Check the sign-up code and try again."
