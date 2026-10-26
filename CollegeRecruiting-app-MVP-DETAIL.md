# College Recruiting App: MVP Detail Plan

*Planning only. No code. Companion to* `CollegeRecruiting-app-PLAN.md` *(which is left unchanged). Covers Phase 1 (MVP) only. Draft 1, 2026-10-26.*

---

## 0. How I read your MVP edits (please confirm)

Your revised Section 2 reduces the MVP to this core. I treated the short bullet lists at the top of Section 2 as the source of truth, and used the older feature table only where it did not conflict.

**Athlete can:**

1. Log in (username and password).
2. Enter profile information (personal and athletic, plus academics and links).
3. Enter college selection preferences (division, competitiveness, location, etc.).
4. Search a college database and build **My College List**.
5. See contact info (college coaches) for each college.
6. Keep a **dated activity log** per college.
7. Set a **next step reminder** per college.

**Club recruiting coordinator can:**

1. Log in.
2. Review all information for athletes assigned to them.
3. Edit any of that information.

**Assumptions I made. Change any that are wrong:**


| #   | Assumption                                                                                                                                                                                                                                           | Effect                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A1  | "College recruiting coordinator" in your bullets means the **club** recruiting coordinator/coach (the Rockets coordinators), not a coach at a college. College coaches appear only as **contact records** in the database.                           | Two different "coach" concepts. This doc calls them **Club Staff** and **College Coach** throughout. |
| A2  | **No separate Parent role.** Parents share the athlete's login (per your note in feature #1).                                                                                                                                                        | One account per athlete family. We cannot tell athlete edits from parent edits.                      |
| A3  | Athletes are **14-18 only** (per Section 1), so the under-13/COPPA gate is dropped. They are still minors, so privacy and parent consent still apply.                                                                                                | Date of birth is collected to confirm age range.                                                     |
| A4  | Removed from MVP: shareable profile link, club-wide college notes, team broadcast, coach analytics/"needs attention" flags, college criteria worksheet and fit scoring, compare view, fit badge on search, Google/Apple sign-in, push notifications. | Listed in Section 1.2 so nothing is dropped silently.                                                |
| A5  | The coordinator still needs a **simple roster list** to find athletes. That is the entire "dashboard" in the MVP.                                                                                                                                    | One page, not a dashboard.                                                                           |
| A6  | Reminders in the MVP = in-app "due/overdue" plus an **email digest** to the account email. Push is deferred.                                                                                                                                         | Parents who share the login still get the nudges.                                                    |
| A7  | Volleyball only, women's programs first. Sport-specific lists (positions, activity types) are configuration data, not hard-coded.                                                                                                                    | Matches Design Principle 5.                                                                          |


---



## 1. MVP scope



### 1.1 In scope


| Area             | Included                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication   | Invite-based registration, username/password login, password reset by email, logout, change password                                           |
| Athlete profile  | Identity, guardians, athletic, academics, links/highlights, profile completeness %                                                             |
| Preferences      | Division(s), competitiveness, location/distance, size, majors, cost/scholarship                                                                |
| College database | Searchable/filterable list of volleyball programs, detail page with college coach contacts, "last verified" date, add-your-own college         |
| My College List  | Up to 30 colleges, priority 1-4, stage, notes, remove/close                                                                                    |
| Activity log     | Dated entries per college (emails, calls, camps, visits, etc.), timeline, plus system entries for stage/priority changes                       |
| Next steps       | One open next step per college with due date, home-screen "due soon/overdue", email digest                                                     |
| Club coordinator | Roster list, open any assigned athlete, review and edit everything the athlete can                                                             |
| Admin (light)    | Create staff accounts, import roster and create invites, manage college and college-coach data, review correction reports, view change history |
| Audit            | Change history on athlete data (who, what, when), because coordinators can edit                                                                |




### 1.2 Deferred (not MVP)

Shareable public profile link; compare view; fit badge and fit scoring; criteria worksheet; club-wide notes on a college; broadcast announcements; coordinator analytics and flags; Google/Apple sign-in; push notifications; parent as a separate role; in-app email sending or Gmail connection; video upload; photo upload; season-stats tables; tournament schedule; calendar sync; college coach accounts; payments; AI; native apps.

---



## 2. Roles and permissions


| Role                               | Who                                              | Can do                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Athlete (family account)**       | Player; parent shares the login                  | Everything on their own data: profile, preferences, list, activity log, next steps. Cannot see other athletes.                             |
| **Club Staff (coordinator/coach)** | 3 recruiting coordinators; possibly team coaches | View and edit all data for **assigned** athletes. CAN edit the shared college database.                                                    |
| **Club Admin**                     | 1-2 people                                       | Everything Club Staff can do for all athletes, plus user/invite management, roster import, college data management, change-history viewer. |


**Rules**

- Athletes see which staff are assigned to them (transparency for minors).
- Every edit made by staff is attributed to that staff member in the change history and shown to the athlete ("Updated by Coach Smith, Oct 3").
- No public pages show athlete data. No athlete data is visible without login.
- The college database is shared reference data, readable by every logged-in user. Admins & Club staff can change master records.

---



## 3. Data elements

**Conventions.** Every record also carries: `id`, `created_at`, `updated_at`, `created_by`, `updated_by`. "Req" = required to save (R), required for a "complete" profile (C), or optional (O). Types are plain-language, not database types.

### 3.1 Authentication and accounts



#### Account (one login)


| Field                                   | Type                                    | Req                | Notes                                                                                                                 |
| --------------------------------------- | --------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| username                                | text, unique, case-insensitive          | R                  | 4-30 chars, letters/numbers/dot/underscore. Chosen at registration.                                                   |
| contact email                           | email                                   | R                  | Used for password reset and the reminder digest. For athletes this is typically the parent's email. Must be verified. |
| email verified at                       | datetime                                |                    | Blank until the verification link is clicked.                                                                         |
| password (stored as a salted hash only) | secret                                  | R                  | Minimum 10 characters, checked against common/breached passwords. No forced complexity rules or forced rotation.      |
| role                                    | enum: Athlete, Club Staff, Club Admin   | R                  |                                                                                                                       |
| status                                  | enum: Invited, Active, Locked, Disabled | R                  |                                                                                                                       |
| club                                    | reference                               | R                  | One club (Rockets) in the pilot, but keep the field.                                                                  |
| linked athlete                          | reference                               | R for Athlete role | One account to one athlete record.                                                                                    |
| display name                            | text                                    | R                  | Shown in "updated by" labels. For athlete accounts, the athlete's name.                                               |
| failed login count / locked until       | number / datetime                       |                    | Lock for 15 minutes after 5 failures; admin can unlock.                                                               |
| last login at                           | datetime                                |                    |                                                                                                                       |
| must change password                    | yes/no                                  |                    | Set when an admin resets or creates a password.                                                                       |
| email digest preference                 | enum: Daily, Weekly, Off                |                    | Default Weekly.                                                                                                       |
| time zone                               | text                                    |                    | Default from club (America/Chicago); used for due dates.                                                              |




#### Invite - THIS IS NOT NEEDED.  WE WILL NOT USE INVITATIONS


| Field                           | Type                                  | Req | Notes                                                                         |
| ------------------------------- | ------------------------------------- | --- | ----------------------------------------------------------------------------- |
| code                            | random text, single use               | R   | Long and unguessable; sent as a link.                                         |
| role                            | enum                                  | R   | Athlete or Club Staff.                                                        |
| intended athlete / staff record | reference                             | R   | The roster import creates the athlete shell first; the invite attaches to it. |
| sent to email                   | email                                 | R   |                                                                               |
| expires at                      | datetime                              | R   | 14 days by default.                                                           |
| status                          | enum: Pending, Used, Expired, Revoked | R   |                                                                               |
| used at / used by account       | datetime / reference                  |     |                                                                               |




#### Password reset request


| Field                  | Type      | Notes                                   |
| ---------------------- | --------- | --------------------------------------- |
| account                | reference |                                         |
| token (stored hashed)  | secret    | One use, expires in 1 hour.             |
| requested at / used at | datetime  |                                         |
| request origin         | text      | IP/browser summary for security review. |




#### Login event (security record)


| Field                           | Type                                                                   | Notes           |
| ------------------------------- | ---------------------------------------------------------------------- | --------------- |
| account (or attempted username) | reference/text                                                         |                 |
| result                          | enum: Success, Bad password, Locked, Reset requested, Password changed |                 |
| timestamp, IP, browser          | datetime/text                                                          | Keep 12 months. |




#### Consent record (important because athletes are minors) - NOT PART OF MVP


| Field       | Type                                                        | Notes                                                                                                                           |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| account     | reference                                                   |                                                                                                                                 |
| document    | enum: Terms of Use, Privacy Policy, Parent/Guardian Consent |                                                                                                                                 |
| version     | text                                                        |                                                                                                                                 |
| accepted at | datetime                                                    |                                                                                                                                 |
| accepted by | enum: Parent/Guardian                                       | Registration screen has a checkbox: "I am the parent/guardian of this athlete or have their permission to manage this account." |




#### Session

Standard sign-in session. Idle timeout 12 hours; "keep me signed in" option up to 30 days on personal devices. Staff and admin sessions: idle timeout 2 hours.

**Authentication rules**

1. No open sign-up. Registration requires a valid invite link/code.
2. Registration screen: choose username, contact email, password, consent checkbox, then email verification.
3. Generic error messages on login and reset ("username or password is incorrect") so usernames cannot be probed.
4. Admin can reset a password (forces change on next login) and disable an account.
5. Staff and admin: consider adding two-factor later (Phase 2). Not required for MVP but flagged because staff can see every athlete's data. - NOT FOR MVP



### 3.2 Club structure


| Record                          | Fields                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Club**                        | name, short name, logo (optional), time zone, active season label (e.g., "2026-27")                                |
| **Team**                        | club, name (e.g., "17 Open"), age/grad-year group, season, level (free text: Open, Premier, etc.), head coach name |
| **Club Staff profile**          | account, first/last name, title (Recruiting Coordinator, Team Coach, Director), email, phone, teams they coach     |
| **Athlete-to-Staff assignment** | athlete, staff member, role on this athlete (Primary coordinator / Secondary), assigned date                       |




### 3.3 Athlete

The athlete record is split into sections so the profile can be filled in progressively and shown as tabs.

#### A. Identity and contact


| Field                         | Type                     | Req | Notes                                                                        |
| ----------------------------- | ------------------------ | --- | ---------------------------------------------------------------------------- |
| first name, last name         | text                     | R   |                                                                              |
| preferred name                | text                     | O   |                                                                              |
| date of birth                 | date                     | R   | Confirms the 14-18 age range. Visible only to the athlete and staff.         |
| graduation year               | number                   | R   | Drives grade level, e.g., 2028.                                              |
| current grade                 | derived                  |     | Calculated from graduation year and today's date.                            |
| sport                         | enum                     | R   | Volleyball (config-driven).                                                  |
| program type                  | enum: Women's, Men's     | R   | Women's for the pilot.                                                       |
| home city                     | text                     | C   |                                                                              |
| home state                    | enum                     | R   |                                                                              |
| home ZIP                      | text                     | C   | Used only to calculate distance to colleges; no street address is collected. |
| athlete email                 | email                    | O   | Separate from the account email.                                             |
| athlete phone                 | phone                    | O   | Mobile; used for texts from coaches.                                         |
| preferred way to be contacted | enum: Email, Phone, Text | O   |                                                                              |
| team                          | reference to Team        | R   |                                                                              |
| club jersey number            | text                     | O   |                                                                              |




#### B. Parent/guardian contacts (up to 2; contact records only, not logins)


| Field                            | Type                                  | Req | Notes                                                 |
| -------------------------------- | ------------------------------------- | --- | ----------------------------------------------------- |
| relationship                     | enum: Mother, Father, Guardian, Other | R   |                                                       |
| full name                        | text                                  | R   |                                                       |
| email                            | email                                 | C   |                                                       |
| phone                            | phone                                 | O   |                                                       |
| primary contact                  | yes/no                                |     | Exactly one primary.                                  |
| OK to share with college coaches | yes/no                                | O   | Default Yes; used in later phases for shared profile. |




#### C. Athletic


| Field                                            | Type                                                                                               | Req | Notes                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------- |
| primary position                                 | enum (config): Outside Hitter, Opposite Hitter, Middle Hitter, Setter, Libero/Defensive Specialist | R   |                                                   |
| secondary position                               | enum                                                                                               | O   |                                                   |
| height                                           | feet/inches (stored as inches)                                                                     | C   |                                                   |
| standing reach                                   | inches                                                                                             | O   |                                                   |
| approach touch                                   | inches                                                                                             | O   |                                                   |
| block touch                                      | inches                                                                                             | O   |                                                   |
| dominant hand                                    | enum: Right, Left                                                                                  | O   |                                                   |
| club team name and level                         | text                                                                                               | C   | Pre-filled from Team.                             |
| club coach: name, email, phone                   | text/email/phone                                                                                   | C   |                                                   |
| high school: name                                | text                                                                                               | C   | Also in academics; one field, shown in both tabs. |
| high school volleyball coach: name, email, phone | text/email/phone                                                                                   | O   |                                                   |
| awards and honors                                | long text                                                                                          | O   | Free text.                                        |
| season stats summary                             | long text                                                                                          | O   | Free text in MVP (structured stats come later).   |
| athletic notes for coaches ("about me")          | long text                                                                                          | O   | Short pitch/personality.                          |




#### D. Academics


| Field                          | Type                                  | Req | Notes                        |
| ------------------------------ | ------------------------------------- | --- | ---------------------------- |
| high school name, city, state  | text                                  | C   |                              |
| GPA unweighted                 | number                                | C   | 0.00-4.00                    |
| GPA weighted                   | number                                | O   |                              |
| GPA last updated               | date                                  | O   |                              |
| class rank                     | text                                  | O   |                              |
| intended major(s)              | up to 3 from major categories         | C   | Feeds college search filter. |
| undecided on major             | yes/no                                | O   |                              |
| SAT best total, date           | number/date                           | O   |                              |
| ACT best composite, date       | number/date                           | O   |                              |
| planned test dates             | text                                  | O   |                              |
| NCAA Eligibility Center status | enum: Not started, Registered, Unsure | O   |                              |
| NAIA eligibility status        | enum: Not started, Registered, Unsure | O   |                              |
| counselor name, email          | text/email                            | O   |                              |




#### E. Links and highlights


| Field                                  | Type        | Req | Notes                                          |
| -------------------------------------- | ----------- | --- | ---------------------------------------------- |
| highlight video links (repeat up to 3) | label + URL | C   | YouTube/Vimeo/Hudl. Links only; no upload.     |
| game film link                         | URL         | O   |                                                |
| social handles (Instagram, X, TikTok)  | text        | O   | Needed so athletes can check what coaches see. |
| external recruiting profile link       | URL         | O   | e.g., University Athlete or other service.     |




#### F. College preferences ("desires")

This is the data behind college search filters and a future fit badge.


| Field                                                 | Type                                                                                                                                                            | Req | Notes                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------- |
| target divisions                                      | multi-select: NCAA D-I, D-II, D-III, NAIA, NJCAA                                                                                                                | R   | Plus a flag per choice: "Top choice" / "Open to". |
| competitiveness desired                               | single choice: Top national contender / Highly competitive conference / Solid mid-level program / Balanced (academics and volleyball equal) / Just want to play | R   | The answer to "how competitive".                  |
| playing-time expectation                              | single choice: Want to start as a freshman / Willing to earn a spot / Fine developing over time                                                                 | O   |                                                   |
| preferred regions                                     | multi-select regions or states                                                                                                                                  | O   |                                                   |
| max distance from home                                | miles, or "no limit"                                                                                                                                            | O   | Uses home ZIP.                                    |
| school size                                           | multi-select: Small (<3k), Medium (3-10k), Large (10k+)                                                                                                         | O   |                                                   |
| public / private                                      | multi-select                                                                                                                                                    | O   |                                                   |
| campus setting                                        | multi-select: Urban, Suburban, Rural                                                                                                                            | O   |                                                   |
| academic importance                                   | 1-5 scale                                                                                                                                                       | O   |                                                   |
| majors / interests (could differ from intended major) | text/major categories                                                                                                                                           | O   |                                                   |
| cost / scholarship need                               | single choice: Need significant aid / Some aid helpful / Not a factor                                                                                           | O   |                                                   |
| faith-based or other must-haves                       | text                                                                                                                                                            | O   |                                                   |
| deal-breakers                                         | long text                                                                                                                                                       | O   | e.g., "no more than 6 hours from home".           |
| anything else about your ideal school                 | long text                                                                                                                                                       | O   |                                                   |
| preferences last reviewed                             | date                                                                                                                                                            |     | Prompts a refresh each season.                    |




#### G. Profile status (derived)


| Field                  | Notes                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| profile completeness % | Count of "C" and "R" fields filled / total. Shown on Home and the coordinator roster. |
| last athlete activity  | Latest athlete login or edit; used in the roster.                                     |




### 3.4 College (database record)

Two parts: the school and its volleyball program. Keep them as two records internally so more sports can be added later, even though users see one "College".

#### College (school)


| Field                           | Type                                                          | Notes                                         |
| ------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| name                            | text                                                          | Official name.                                |
| short name / athletics nickname | text                                                          | e.g., "Hawkeyes".                             |
| city, state, ZIP                | text                                                          | Distance calculated from the athlete's ZIP.   |
| latitude/longitude              | numbers                                                       | Pre-calculated.                               |
| website URL                     | URL                                                           |                                               |
| public or private               | enum                                                          |                                               |
| undergraduate enrollment        | number                                                        | Used for the size filter.                     |
| campus setting                  | enum: Urban, Suburban, Rural                                  | O                                             |
| academic selectivity            | enum: Highly selective, Selective, Moderately selective, Open | O                                             |
| majors offered                  | multi-select of major categories                              | Categories only, not individual majors.       |
| cost link (net price page)      | URL                                                           | We link out; no tuition numbers to maintain.  |
| tuition in-state / out-of-state | numbers                                                       | O. Tuition range filter only if we load this. |
| religious affiliation           | text                                                          | O                                             |


DO NOT USE/IMPORT College FIELDS:  AVCA_Ranking, RPI_Rank, Region, Reg_rank, college_name_from_reg_rank_file, college_name_from_reg_rank_file, Match_score, MASSEY_college_name

#### Volleyball program


| Field                        | Type                                                                                                              | Notes                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| college                      | reference                                                                                                         |                                                                                        |
| sport / program type         | enum                                                                                                              | Volleyball, Women's.                                                                   |
| division                     | enum: NCAA D-I, D-II, D-III, NAIA, NJCAA                                                                          |                                                                                        |
| conference                   | text                                                                                                              |                                                                                        |
| program web page URL         | URL                                                                                                               |                                                                                        |
| recruiting questionnaire URL | URL                                                                                                               | Most programs have one; very useful.                                                   |
| camps page URL               | URL                                                                                                               |                                                                                        |
| social links                 | URLs                                                                                                              | Instagram, X.                                                                          |
| last season record           | text                                                                                                              | O                                                                                      |
| competitiveness tier         | enum (admin-assigned): T1=Top national / T2=Highly competitive / T3=Upper mid-level/ T4=Mid-level / T5=Developing | O, **used to match the athlete's "competitiveness" preference**. See Open Decision D6. |
| last verified date           | date                                                                                                              | Required. Shown to users.                                                              |
| verified by / data source    | text                                                                                                              | Who confirmed and where it came from (staff page, phone, etc.).                        |
| status                       | enum: Active, Program dropped, Needs review                                                                       |                                                                                        |




### 3.5 College Coach (contact records)


| Field                                  | Type                                                                                                           | Req | Notes                                                                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| program                                | reference                                                                                                      | R   |                                                                                                                                                                      |
| full name                              | text                                                                                                           | R   |                                                                                                                                                                      |
| title                                  | enum: Head Coach, Associate Head Coach, Assistant Coach, Recruiting Coordinator, Director of Operations, Other | R   |                                                                                                                                                                      |
| email                                  | email                                                                                                          | O   |                                                                                                                                                                      |
| phone                                  | phone                                                                                                          | O   |                                                                                                                                                                      |
| primary recruiting contact             | yes/no                                                                                                         |     | At most one per program; shown first.                                                                                                                                |
| recruits which class years / positions | text                                                                                                           | O   | e.g., "Setters and liberos".                                                                                                                                         |
| staff page URL                         | URL                                                                                                            | O   | Where we got it.                                                                                                                                                     |
| social handles                         | text                                                                                                           | O   |                                                                                                                                                                      |
| employment status                      | enum: Current, Departed, Unknown                                                                               | R   | Departed coaches are hidden but retained for history.                                                                                                                |
| last verified date, source             | date/text                                                                                                      | R   |                                                                                                                                                                      |
| owner                                  | reference                                                                                                      |     | Empty = shared master record. If an athlete adds a coach themselves, owner = that athlete and the record is private to them and their staff (see Section 4, rule 6). |




### 3.6 My College List entry


| Field                       | Type                                               | Req                 | Notes                                                                                                            |
| --------------------------- | -------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| athlete                     | reference                                          | R                   |                                                                                                                  |
| college program             | reference                                          | R                   | Master database record or an athlete-added custom college.                                                       |
| priority                    | 1-4                                                | R                   | 1 = top choice, 2 = strong target, 3 = good fit, 4 = backup. Default 3.                                          |
| stage                       | enum                                               | R                   | Researching, Shortlisted, Contacted, In conversation, Camp/Visit, Offer, Committed, Closed. Default Researching. |
| closed reason               | enum: I passed, College passed, No response, Other | when stage = Closed |                                                                                                                  |
| date added                  | date                                               |                     |                                                                                                                  |
| why I like this school      | long text                                          | O                   |                                                                                                                  |
| general notes               | long text                                          | O                   |                                                                                                                  |
| coach I'm mainly talking to | reference to College Coach                         | O                   | Shown at the top of the college page.                                                                            |
| questionnaire completed     | yes/no, date                                       | O                   | Quick tick since this is a very common step.                                                                     |
| last activity date          | derived                                            |                     | From the activity log; used for "silent for X weeks".                                                            |
| current next step           | derived                                            |                     | Link to the open Next Step (3.8).                                                                                |
| added by                    | reference                                          |                     | Athlete or staff member.                                                                                         |


**Limits and rules**

- Max 30 per athlete (configurable). The same college cannot appear twice.
- Removing a college archives it (history stays visible to staff); the athlete may restore it.
- When the list exceeds 15 for juniors/seniors, show a gentle "narrow your list" hint. No hard block.



### 3.7 Activity log (dated entries per college)


| Field                          | Type                                                        | Req                               | Notes                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| list entry (athlete + college) | reference                                                   | R                                 |                                                                                                                                                                |
| activity date                  | date (and optional time)                                    | R                                 | Defaults to today. The date the thing happened, not the date entered.                                                                                          |
| activity type                  | enum                                                        | R                                 | Email, Phone call, Text/DM, Video call, Camp/Clinic, Campus visit (unofficial), Official visit, Questionnaire submitted, Coach saw me play, Offer, Other note. |
| direction                      | enum: I contacted them / They contacted me / Not applicable | R for Email, Call, Text/DM, Video |                                                                                                                                                                |
| college coach involved         | reference (optional), plus free-text name                   | O                                 | Choose from that program's coach contacts.                                                                                                                     |
| summary                        | short text                                                  | R                                 | One line, e.g., "Sent intro email with video."                                                                                                                 |
| details                        | long text                                                   | O                                 | What was said, answers, questions, what the coach asked for.                                                                                                   |
| outcome / how it went          | enum: Positive, Neutral, Negative, Waiting for reply        | O                                 | Feeds the contact-status color later.                                                                                                                          |
| follow-up needed               | yes/no                                                      | O                                 | If Yes, the form offers to create a Next Step.                                                                                                                 |
| attachment link                | URL                                                         | O                                 | Pasted link to email thread or doc (no file uploads).                                                                                                          |
| entry source                   | enum: Athlete, Staff, System                                | R                                 | System = automatic stage/priority/added-to-list entries.                                                                                                       |
| entered by                     | reference to account                                        | R                                 | Shows coach label: "Added by Coach Smith".                                                                                                                     |
| edit/delete                    |                                                             |                                   | Authors can edit; delete is a "soft delete" kept in change history. System entries cannot be edited.                                                           |


**Views.** Timeline per college (newest first, filter by type). One combined "All activity" timeline across colleges (filter by college, type, date range). Staff see the same views.

### 3.8 Next step (reminder)


| Field                          | Type                                                                                           | Req | Notes                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------- |
| list entry (athlete + college) | reference                                                                                      | R   |                                                          |
| what to do                     | short text                                                                                     | R   | e.g., "Follow up with Coach Lee about the camp."         |
| due date                       | date                                                                                           | R   |                                                          |
| step type                      | enum: Send email, Follow up, Call, Send video, Register for camp, Plan visit, Thank-you, Other | O   | Quick-pick chips; the type pre-fills suggested text.     |
| status                         | enum: Open, Done, Skipped                                                                      | R   |                                                          |
| completed at / by              | datetime/reference                                                                             |     |                                                          |
| snooze until                   | date                                                                                           | O   |                                                          |
| created by                     | enum: Athlete, Staff, System                                                                   | R   |                                                          |
| outcome on completion          | prompt                                                                                         |     | "Log it?" Completing offers to create an activity entry. |


**Rules**

- Each list entry has **at most one open next step** (keeps the list "guided, not overwhelming"). Completed ones remain as history.
- Suggested default due date: 7 days out (editable). Suggested after "Contacted" with no reply: 14 days.
- Overdue = due date before today and status Open.
- Digest email lists: overdue steps, steps due in the next 7 days, and colleges on the list with no activity in 21+ days.



### 3.9 Change history (audit)

Needed because staff can edit any athlete data and the parent/athlete need to see it.


| Field                         | Notes                                                                  |
| ----------------------------- | ---------------------------------------------------------------------- |
| athlete                       | whose data changed                                                     |
| record type and record        | Profile section, preference, list entry, activity entry, next step     |
| field name                    |                                                                        |
| old value / new value         | Long text stored in full; sensitive values (DOB) masked in the viewer. |
| changed by (account) and role | Athlete / Staff / Admin / System                                       |
| changed at                    |                                                                        |
| change type                   | Created, Updated, Deleted, Restored                                    |


- Visible to: admin (all), staff (assigned athletes), athlete (only changes made by staff or admin, shown as a simple "Recent changes by your coach" panel).
- Kept for the life of the account.



### 3.10 Data correction report


| Field                            | Notes                 |
| -------------------------------- | --------------------- |
| college program or college coach | which record is wrong |
| reported by                      | account               |
| what's wrong                     | short text            |
| suggested correct value          | text, optional        |
| status                           | Open, Fixed, Rejected |
| resolved by / at / admin note    |                       |




### 3.11 Reference lists (configuration data, editable by admin)

Divisions; volleyball positions; major categories (about 25-30: Business, Health sciences, Education, Engineering, Biology, Communications, etc.); US states and regions; activity types; stage names; next-step types; competitiveness options; handedness. Stage and priority definitions come from the PLAN doc and live here too.

---



## 4. Business rules

1. **One athlete = one record = one login.** Staff are linked to athletes by assignment.
2. **Required to start:** first/last name, graduation year, home state, team, primary position, preferences (divisions and competitiveness). The rest is progressive, tracked by completeness %.
3. **Reminders are on the athlete's timeline, not the staff's.** Staff can add a next step to an athlete's college, labeled with their name, visible to the athlete.
4. **Stage change logs itself.** Changing stage or priority creates a System activity entry ("Stage: Contacted to In conversation").
5. **Moving to "Contacted" requires nothing**, but the form nudges: "Log your first email?"
6. **Athlete-added colleges and coaches.** The database will be incomplete. An athlete can add a college or a coach contact that is missing. It is private to that athlete (and their staff) and is labeled "Added by you, not verified." Admin can review these in the corrections queue and promote them to the master data.
7. **Master data is read-only to athletes and staff.** They can only "Report a correction."
8. **Coach employment flips to Departed** by admin: the list entry shows a banner "Coach X may have left; check the program page."
9. **Staff scope.** Staff only see and edit athletes assigned to them. Admin sees all.
10. **Concurrent editing.** If an athlete and coordinator edit the same form, the later save warns "this was changed since you opened it." No silent overwrites.
11. **Dates.** All due dates are date-only (no time of day) and compared in the club time zone.
12. **Soft delete only** for activity entries and list entries so change history is complete.
13. **Data export.** On request, admin can export an athlete's full data as CSV (privacy requirement, also avoids lock-in).
14. **Account deletion.** Admin can delete an athlete and all linked data on a parent's request.

---



## 5. Site map (list of pages)

*This is the full MVP site map. Section 12.4 marks which pages are built for the pilot and which come later.*



### 5.1 Public (before login)


| #   | Page                                                                 | Purpose                                                                          |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P1  | Sign in                                                              | Username and password; links to reset and invite                                 |
| P2  | Register with invite - NEED to register, but will not use INVITATION | Enter invite code or arrive from link; choose username, email, password; consent |
| P3  | Verify email                                                         | Landing page for the verification link                                           |
| P4  | Forgot password                                                      | Request reset link                                                               |
| P5  | Reset password                                                       | Set new password from emailed link                                               |
| P6  | Terms of Use - NOT MVP                                               |                                                                                  |
| P7  | Privacy Policy - NOT MVP                                             | Plain-language statement about minors' data                                      |
| P8  | Not found / error / session expired                                  |                                                                                  |




### 5.2 Athlete area


| #   | Page                                 | Purpose                                                                                                                     |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Home**                             | Next steps due/overdue, colleges with no recent contact, recent activity, profile completeness, recent changes by coach     |
| A2  | **My Profile** (tabs below)          |                                                                                                                             |
| A2a | Personal and guardians               | Identity, contact, up to 2 guardians                                                                                        |
| A2b | Athletic                             | Position, measurables, coaches, awards, stats text                                                                          |
| A2c | Academics                            | School, GPA, tests, eligibility, counselor                                                                                  |
| A2d | Highlights and links                 | Video links, social, external profile                                                                                       |
| A3  | **My College Preferences**           | The "desires" form (division, competitiveness, location, etc.)                                                              |
| A4  | **Find Colleges**                    | Search and filter results list                                                                                              |
| A5  | **College detail** (database record) | Facts, program info, college coach contacts, links, last verified, "Add to My List", "Report a correction"                  |
| A6  | Add a college not in the database    | Simple form for a custom college and coach                                                                                  |
| A7  | **My College List**                  | List view with priority and stage filters, sort by priority/last activity/next step due, simple stage-grouped (funnel) view |
| A8  | **My College page** (the hub)        | Header: college, priority, stage, current next step, main coach contact                                                     |
| A8a | Overview tab                         | Why I like it, notes, stage/priority editing, questionnaire tick                                                            |
| A8b | Activity tab                         | Timeline for this college + "Log activity" button                                                                           |
| A8c | Contacts tab                         | College coach contacts (email/phone, tap-to-copy), add own contact                                                          |
| A9  | Log activity                         | Add/edit one activity entry (sheet/page)                                                                                    |
| A10 | Set/edit next step                   | Add/edit/complete the step (sheet/page)                                                                                     |
| A11 | **All Next Steps**                   | Every open step across colleges, grouped Overdue / This week / Later                                                        |
| A12 | **All Activity**                     | Combined timeline with filters                                                                                              |
| A13 | **Account settings**                 | Change password, account email, digest preference, who has access to my data (assigned staff), request export/delete        |
| A14 | **Getting started / Help**           | How the app works; "30 to 15 to 10" list guidance; what to put in an activity log; FAQ; contact the club                    |
| A15 | Onboarding wizard                    | First-login guided steps: confirm profile basics, preferences, add first 5 colleges. Can be skipped and resumed.            |




### 5.3 Club staff area


| #   | Page                                                                         | Purpose                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **Athlete roster**                                                           | Table of assigned athletes: name, team, grad year, profile %, # colleges on list, last activity date, # overdue steps. Filter by team/grad year; search by name. |
| S2  | **Athlete view** (header with athlete name and "You are editing as Coach X") | Same pages as the athlete area, applied to the selected athlete                                                                                                  |
| S2a | Profile (all tabs)                                                           | View and edit                                                                                                                                                    |
| S2b | Preferences                                                                  | View and edit                                                                                                                                                    |
| S2c | College list                                                                 | View, edit, add/remove colleges                                                                                                                                  |
| S2d | College page with activity and contacts                                      | Log activity or next steps on the athlete's behalf                                                                                                               |
| S2e | All next steps / all activity                                                |                                                                                                                                                                  |
| S2f | Change history for this athlete                                              | Who changed what                                                                                                                                                 |
| S3  | Find Colleges / College detail                                               | Same as A4/A5, to add colleges to the athlete's list                                                                                                             |
| S4  | Staff account settings                                                       | Change password, email, digest preference                                                                                                                        |




### 5.4 Admin area


| #   | Page                                  | Purpose                                                                                                           |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| M1  | Admin home                            | Counts: athletes, invites pending, open corrections, stale colleges                                               |
| M2  | Users                                 | List/search accounts; reset password, unlock, disable, delete                                                     |
| M3  | Invites                               | Create, resend, revoke; status                                                                                    |
| M4  | Roster import                         | Upload CSV (team, grad year, athlete name, parent name/email, school); preview; create athlete shells and invites |
| M5  | Teams and assignments                 | Create teams; assign athletes to staff                                                                            |
| M6  | Colleges                              | List/search, create, edit, mark verified, archive; bulk import (CSV)                                              |
| M7  | College coaches                       | List/search, create, edit, mark departed, mark verified; bulk import                                              |
| M8  | Corrections and athlete-added records | Queue of correction reports and custom entries to approve/promote/reject                                          |
| M9  | Reference lists                       | Edit positions, majors, activity types, etc.                                                                      |
| M10 | Change history and security log       | Search by athlete or account; login events                                                                        |
| M11 | Data export / delete tools            | For a family's request                                                                                            |


**Totals:** about 8 public, 19 athlete (counting tabs/sheets), 10 staff, 11 admin pages. The staff area reuses the athlete screens, so the real build effort is closer to 30 distinct screens.

### 5.5 Navigation sketch

- **Athlete (mobile bottom bar):** Home | My List | Find | Profile | More (Next Steps, All Activity, Preferences, Settings, Help)
- **Staff (top bar):** Roster | Find Colleges | Settings. Inside an athlete: tabs Profile | Preferences | College List | Activity | Next Steps | Changes.
- **Admin (side menu):** Home | Users | Invites | Roster import | Teams | Colleges | Coaches | Corrections | Reference | Logs

---



## 6. Core flows

1. **Onboarding.** Admin imports roster, invites go out, family registers, accepts consent, verifies email, completes wizard (basics, preferences, first 5 colleges). Target: under 10 minutes.
2. **Build a list.** Find Colleges, filter (division, state/distance, size, major), open detail, Add to My List. First add shows the "start with 20-30, narrow to 10-15" tip.
3. **Make contact and log it.** College page, copy coach email, send email in own email app, return, Log activity (type Email, I contacted them), set the next step "Follow up in 7 days".
4. **Weekly loop.** Digest email or Home shows what's due, tick done, log the result, set the next step.
5. **Coordinator review.** Roster, sort by last activity or overdue steps, open an athlete, review list and log, edit the profile or add a next step ("Send updated video"), athlete sees it with the coach's name on it.
6. **Data quality.** Athlete reports a wrong coach email; admin confirms and updates; "last verified" date refreshes.

---



## 7. Notifications (MVP)


| Notification                          | To             | Channel                        | Trigger                                          |
| ------------------------------------- | -------------- | ------------------------------ | ------------------------------------------------ |
| Invite - NOT FOR MVP                  | Family / staff | Email                          | Admin creates an invite                          |
| Verify email                          | Account        | Email                          | Registration                                     |
| Password reset / changed              | Account        | Email                          | Reset request, password change                   |
| Reminder digest - NOT FOR MVP         | Account email  | Email, daily or weekly         | Overdue steps, due within 7 days, stale colleges |
| "Your coach updated your information" | Account email  | Email (batched, max 1 per day) | Staff edit                                       |
| In-app badges - NOT FOR MVP           | Athlete        | In-app                         | Overdue count on Home and bottom bar             |


---



## 8. Seed data and operations needed before the pilot

1. **College data load.** Roughly 1,000 to 1,500 women's volleyball programs exist across NCAA I/II/III, NAIA and NJCAA (estimate to be confirmed). Decide whether the pilot loads all of them or a priority subset (see D3). Each needs coach names and emails, which is the largest piece of work in the whole MVP.  ANSWER - I WILL provide information about all the colleges. See 5 files in folder: CollegeInfo.  Each college has a UNITID (unique college ID) - use this as the PK for the college.
2. **Roster import.** Existing club roster supplies team, grad year, school, and parent contact. Treat the file as sensitive; delete it after import.
3. **Staff accounts.** Three coordinators plus one or two admins created manually.
4. **Reference lists** (positions, majors, activity types) loaded from the Volleyball configuration.
5. **Legal text.** Terms, Privacy Policy and Parent/Guardian Consent wording reviewed before launch.
6. **Verification routine.** One admin owns a monthly "check 25 oldest-verified programs" task.

---



## 9. MVP non-functional requirements

- **Mobile-first, usable at 360px wide**; five-minute sessions; large tap targets; tap-to-copy and tap-to-email/call on coach contacts.
- **Privacy:** minimum data collected; no street address; no public pages; data encrypted in transit and at rest; staff access only to assigned athletes; all staff edits recorded; no data sales; export/delete on request.
- **Reliability:** nightly backups; restore tested once before the pilot.
- **Performance:** search results under 2 seconds with the full college set; list pages load under 2 seconds on mobile.
- **Accessibility:** keyboard navigable, readable contrast, form labels (baseline, not a full audit).
- **Analytics:** log events for onboarding steps completed, colleges added, activities logged, next steps completed, staff edits (supports success measures in PLAN Section 7).
- **Browsers:** current Chrome, Safari (iOS and Mac), Edge, Firefox.

---



## 10. Open decisions


| #   | Decision                                                                                     | My recommendation                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Can a coordinator see **all** athletes in the club or only assigned ones?                    | Assigned only; admin sees all. Easy to loosen. - ANSWER: agreed.                                                                                                                                                                                                                             |
| D2  | Should staff be able to leave **private notes** the athlete cannot see?                      | Not in the MVP. Everything staff add is visible, which is simpler and safer for minors. - ANSWER: agreed.                                                                                                                                                                                    |
| D3  | How many colleges to load for the pilot?                                                     | All D-I through NAIA you can verify, or at least every program within a day's drive of Iowa plus the top 150 nationally; allow athlete-added colleges for the rest. ANSWER - about 5000 colleges (all divisions)                                                                             |
| D4  | Can staff add/edit master college coach contacts (crowd-sourced) or only admins?             | Admin only at first, with staff able to submit corrections; revisit after the pilot. - ANSWER: Club Staff (college recruiting coordinators) can edit master college info.                                                                                                                    |
| D5  | Email digest vs. push: is email enough for the pilot?                                        | Yes. Push comes later. - ANSWER: Postpone any email activity to later phase.                                                                                                                                                                                                                 |
| D6  | Who assigns each program a **competitiveness tier** to match "how competitive I want to be"? | Admin/coordinators assign a simple 4-level tier from last season's record and conference; use it only for filtering in the MVP. - ANWER: Each college will have a RANK within their division. This is the criteria for competiveness: Top 10%, 10%-20%, 20%-30%, 30%-40%, 40%-50%, 50%-rest. |
| D7  | Is the **shareable profile link** really out of the MVP?                                     | Out for now. It is small to add later; the profile data above already supports it. - - ANSWER: agreed.                                                                                                                                                                                       |
| D8  | Cap on college list: 30 hard limit?                                                          | Yes, 30 (configurable).                                                                                                                                                                                                                                                                      |
| D9  | Staff two-factor authentication?                                                             | Plan for Phase 2; use long passwords and short staff sessions for now. - ANSWER: agreed.                                                                                                                                                                                                     |
| D10 | Do we store the athlete's NCAA Eligibility Center ID number?                                 | No. Status only. - ANSWER: agreed.                                                                                                                                                                                                                                                           |
| D11 | Photos/headshots?                                                                            | Not in the MVP (avoids storing and moderating images of minors). - ANSWER: agreed.                                                                                                                                                                                                           |


---



## 11. MVP acceptance checklist

- [ ] A family can register from an invite, verify email, and finish onboarding in under 10 minutes. - NOT NEEDED.  Allow athlete/family to create their own account.  Club will provide athlete with a URL to access the site.
- [x] An athlete can save profile, academics, links and preferences, and sees a completeness percentage.
- [x] Search finds colleges by division, state/distance, size, and major; detail shows coach contacts with a last-verified date.
- [x] An athlete can build a list of up to 30 colleges, set priority and stage, and add notes.
- [x] Every college has a dated activity timeline; stage/priority changes appear automatically.
- [x] Every college can have a next step; overdue steps show on Home and in the digest email.
- [x] A coordinator sees only assigned athletes, can open and edit all athlete data, and every edit shows who made it.
- [ ] An admin can import a roster, invite families, reset passwords. NOT NEEDED.
- [x] An admin can edit college and coach data, and resolve correction reports.
- [x] Password reset works; accounts lock after repeated failures; no athlete data is reachable without login.
- [ ] Pilot with the Rockets: at least 70% of invited athletes finish onboarding, 50% active weekly, coordinators report time saved (PLAN Section 5 exit criteria). - NOT NEEDED

---



## 12. Pilot scope (what we actually build and launch first)

The MVP described above is the full target. The **pilot** is a smaller first release that proves the core loop (profile, preferences, college list, activity log, next steps, coordinator review) with a small group before the rest is built. Where this section and Sections 1-11 differ, **this section wins for the pilot**.

### 12.1 Environments

- Two Supabase projects only: **DEV** and **PROD**.
- **The pilot runs in DEV.** PROD is created but left empty until the pilot is judged a success.
- Because DEV will hold real data about minors, it is treated as pilot-stable: schema changes only through migration files, no database resets, regular backups (the free Supabase plan has no automatic backups and pauses idle projects, so either upgrade DEV for the pilot or take weekly exports; confirm the plan).
- **Open question P1:** at launch, do pilot accounts carry over to PROD or are they reset? (Reset is simpler; carry-over needs a migration script and password resets.) Decide before recruiting families.
- Sign-up is open but the URL is shared **only** with the pilot group, with email confirmation and a CAPTCHA on. An optional shared pilot code on the sign-up form is available if wanted (not an invitation system).
- Go/no-go gate: the RLS test plan (DATA-MODEL-RLS doc, Section 8.5) passes before any family signs up.

### 12.2 Who

| Item | Pilot |
|---|---|
| Athletes | 12-15 invited, about 10 expected active; mix of sophomores and juniors, 1-2 seniors if volunteers |
| Teams | One team (two at most) |
| Coordinators | 2 (a primary and a backup) |
| Admin | 1 (you), working mostly in the Supabase dashboard |
| Week 0 dry run | 2-3 friendly test accounts go through the whole flow first |
| Duration | 4-6 weeks |

### 12.3 College data

| Division | Programs | Head coach on file | Pilot |
|---|---|---|---|
| NCAA D-I | 347 | 98% | Load |
| NCAA D-II | 284 | 92% | Load |
| NCAA D-III | 419 | 81% | Load |
| NAIA | 203 | 27% | Load; coordinators fill in Iowa-region schools first (also tests staff editing of college data) |
| NJCAA | 416 | 6% | **Later** (too few coach contacts to be useful) |

- Not limited to D-I: most recruits target D-II, D-III or NAIA.
- UNITID conflicts in the source files (11 IDs, 26 rows) must be corrected before loading.
- **Search filters in the pilot:** division, state, conference, public/private, competitiveness band, name. **Later:** distance, school size, major (need IPEDS enrichment and a ZIP table). Distance is the first to add if athletes ask.

### 12.4 Page-by-page status

Page numbers refer to Section 5. **Pilot** = built for the pilot. **Simplified** = built in a reduced form. **Later** = not built; the substitute is in the last column.

**Public**

| Page | Status | Notes |
|---|---|---|
| P1 Sign in | Pilot | Email + password acceptable for the pilot; username sign-in can follow (option P2) |
| P2 Register | Pilot | Self-registration; no invite |
| P3 Verify email | Pilot | Supabase Auth |
| P4 Forgot password / P5 Reset password | Pilot | Supabase Auth |
| P6 Terms, P7 Privacy | Later | Not MVP (see risk note in the data-model doc) |
| P8 Not found / error | Pilot | Minimal |

**Athlete**

| Page | Status | Substitute / notes |
|---|---|---|
| A1 Home | Pilot | Overdue and due-this-week next steps, silent colleges, recent activity |
| A2 My Profile (A2a-A2d) | Pilot | Four tabs; completeness bar |
| A3 My College Preferences | Pilot | Includes competitiveness bands |
| A4 Find Colleges | Simplified | Filters listed in 12.3 only |
| A5 College detail | Simplified | No "Report a correction" button |
| A6 Add a college not in the database | Later | With 1,000+ programs loaded it may not be needed |
| A7 My College List | Simplified | Plain list with priority and stage filters; no funnel view |
| A8 My College page (A8a-A8c) | Pilot | Overview, Activity, Contacts |
| A9 Log activity | Pilot | |
| A10 Set/edit next step | Pilot | |
| A11 All Next Steps | Later | Home covers it |
| A12 All Activity | Later | Per-college timelines cover it |
| A13 Account settings | Simplified | Change password only |
| A14 Help | Later | One-page handout |
| A15 Onboarding wizard | Later | Profile pages with completeness bar |

**Club staff**

| Page | Status | Notes |
|---|---|---|
| S1 Athlete roster | Pilot | Name, team, grad year, profile %, # colleges, last activity, # overdue |
| S2 Athlete view (S2a-S2e) | Pilot | Reuses the athlete screens |
| S2f Change history for an athlete | Later | Audit rows are still recorded; view them in the dashboard |
| S3 Find Colleges / detail | Pilot | |
| (new) Edit college and coach record | Pilot | Required: staff edit master college data (D4) |
| S4 Staff account settings | Simplified | Change password only |

**Admin** (all done in the Supabase dashboard, with saved queries, for the pilot)

| Page | Status | Pilot substitute |
|---|---|---|
| M1 Admin home | Later | Dashboard |
| M2 Users | Later | Promote staff and disable accounts in the dashboard |
| M3 Invites / M4 Roster import | Not needed | No invites, no roster import |
| M5 Teams and assignments | Later | Create 1-2 teams and assign about 12 athletes to coordinators in the dashboard |
| M6 Colleges / M7 College coaches (bulk import) | Pilot (as a script) | One-time load script; staff use the edit form above for fixes |
| M8 Corrections queue | Later | Staff fix data directly |
| M9 Reference lists | Later | Dashboard |
| M10 Change history and security log | Later | Dashboard queries |
| M11 Export / delete tools | Later | Manual, on request |

### 12.5 Features and rules deferred for the pilot

- Athlete picks their own coordinator (admin assigns in the dashboard).
- Athlete-added (custom) colleges and the table behind them.
- Correction reports.
- Athlete-facing "recent changes by your coach" panel (audit recording stays on).
- Concurrency version warning (last save wins; the audit trail is the safety net).
- "Narrow your list" hint, funnel view, priority-balance hint.
- Analytics events (use Supabase logs and weekly check-ins instead).
- Account lockout after 5 failed attempts and the 2-hour staff session timeout (Supabase defaults apply).
- All email beyond sign-in verification and password reset (digest, "coach updated" email), per D5.
- Username sign-in (option; email sign-in is acceptable for the pilot).
- NJCAA programs; distance, size and major filters.

### 12.6 Pilot success measures

- At least 8 of 12 athletes finish profile and preferences and add 5 colleges within about 10 minutes.
- At least 6 athletes log an activity or set a next step in two different weeks.
- Both coordinators use the roster and edit at least one athlete record and one college record.
- Zero data leaks between athletes (RLS test plan passes before launch and spot checks stay clean).
- A short weekly check-in with coordinators and a few parents; list of requested features ranked after week 4.

### 12.7 Pilot open items

| # | Item |
|---|---|
| P1 | Carry pilot accounts to PROD, or reset them at launch? |
| P2 | Email sign-in only for the pilot, or build username sign-in now? |
| P3 | Shared pilot code on the sign-up form, or rely on a private URL plus CAPTCHA? |
| P4 | Upgrade DEV for backups and no auto-pause during the pilot, or take weekly exports? |
| P5 | Which team and which two coordinators? |
