# College Recruiting App — Product & Phased Release Plan

*Draft 1 · Sources:* `recruiting Feb 2026.pptx` *(Iowa Rockets recruiting talk),* `CollegeRecuriting-app-rqmts.docx` *(initial feature list),* `MRASophomoreYearWebsiteFreebieGuide.pdf` *(My Recruiting Assistant guide),* `Player contact info 6 13 24.xlsx` *(club roster layout; personal data not reproduced here).*

---

## 1. What we're building, and for whom

**One line:** a guided, low-cost "recruiting copilot" that tells a high school player what to do this week, keeps every college conversation in one place, and lets the club coach help without chasing screenshots and spreadsheets.

**What the source docs tell us**

- The recruiting process is mostly *repeatable weekly habits*: build a list (30 → 15 → 10), email each coach on a cadence, keep a profile and highlight video current, stay academically eligible, plan camps and visits. The deck and the guide agree on this. An app can turn that into a to-do list and reminders.
- What you do depends on grade (freshman, sophomore, junior, senior), division (NCAA I/II/III, NAIA, NJCAA) and position. The app has to be driven by *grade + target level*, not one generic checklist.
- Players and parents do most of the work. Paid services ($250–$2,500) mostly sell a coach contact database, a target list, video editing and nudging. The deck says a service is not required. **That is the gap: give families the database, the structure and the nudges at low or no cost.**
- The club has real roles: about 3 recruiting coordinators supporting roughly 90 players across teams (per the roster file: team, grade, school, parents). Coordinators already help with first contact, phone-interview prep and reviewing lists. The app should make *their* time go further.
- This service only for players who are in High School (14yo-18yo).

**Users**


| User                                    | What they need                                                                                       | MVP?                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| **Player** (13–18)                      | "What do I do this week?", a place for her college list, notes, emails and profile                   | Yes                  |
| **Parent**                              | Visibility, reminders, help with cost/eligibility/visits. Often the one managing email and logistics | Yes (linked account) |
| **Club coach / recruiting coordinator** | See who is stuck, add notes and contacts, share what they know about colleges                        | Yes                  |
| **Club admin**                          | Import roster, manage teams, seasons, invites                                                        | Yes (light)          |
| **College coach**                       | Find players for their need (position, class, academics)                                             | Later (Phase 5)      |


**Design principles**

1. **Mobile-first, five-minute sessions.** Teenagers use phones. Every screen should answer "what's next?" in one tap.
2. **Guide, don't overwhelm.** Show 3 tasks this week, not 60.
3. **Player stays in control.** Emails come from the player's own address, in her voice. No auto-spam to coaches.
4. **Club-friendly.** The club is how we reach users, so the club coach gets a real dashboard.
5. **Any sport.** Sport-specific items (positions, stats, rule calendars, checklist content) live in configuration, not code. Volleyball ships first.
6. **Privacy by default.** These are minors. See Section 8.

---



## 2. MVP (Phase 1): "Plan, List, Track, Coach"

Goal: a volleyball player can set up in under 10 minutes, see her personal roadmap, build and prioritize a college list, log every contact, and her club coach can see and help. Pilot with the Iowa Rockets (~90 players, 3 coordinators).

Provide a platform where an athlete can:

- Enter their profile information (personal & athletic)
- Provide info about their college selection & desires
- Provide info about their desire of: Division, competitiveness, etc
- Create "My College List" of colleges they are interested in
- Obtain contact info for colleges
- Maintain a dated activity log about activities for each college on My College List
- Requires authentication (probably username & password)
- Have a "next steps" reminder for each college on My College List

Provide a platform where a college recruiting coordinator can work with the athlete:

- Review all of the athlete infomation
- Edit/update any/all athlete information



### MVP feature set


| #   | Feature                                 | How it works                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Accounts & roles**                    | Sign up via club invite link or code (email + password or Google/Apple sign-in). Roles: player, parent, club coach, club admin. A parent links to a player by player invite. Player under 13 can't register without a parent (COPPA).Parents will share the athlete's login/account. |
|     |                                         |                                                                                                                                                                                                                                                                                       |
| 3   | **Player profile** (see 2.1)            | Short guided form, saved progressively. Required fields small; the rest optional.                                                                                                                                                                                                     |
| 4   |                                         |                                                                                                                                                                                                                                                                                       |
| 5   | **College database + search** (see 2.3) | Search and filter volleyball programs (all levels) with the coach name, email, phone and basic facts.                                                                                                                                                                                 |
| 6   | **My College List** (see 2.4)           | Up to 30 colleges, each with a priority (1–4) and a stage. Funnel view: researching → shortlisted → contacted → talking → visited → offer → decision.                                                                                                                                 |
| 7   | **Contact log & notes**                 | Per college: log emails, calls, texts, camps, visits; free-text notes; attach the coach's reply summary. Timeline view.                                                                                                                                                               |
| 8   |                                         |                                                                                                                                                                                                                                                                                       |
| 9   | **Reminders**                           | Weekly follow-up nudges, task due dates, "haven't contacted X in 3 weeks". Delivered by push (PWA/mobile) and email digest. Parent can be CC'd.                                                                                                                                       |
| 10  | **Club coach dashboard** (see 2.6)      | Roster table with progress, list size, last activity, "needs attention" flags. Open a player to view her list and log. Add notes, contacts and actions to her entries. Write club-wide notes on a college.                                                                            |
| 11  | **Shareable profile link**              | One read-only page (stats, academics, video link, contacts, club/coach info) the player can paste into emails. Replaces the Rockets "player web page" idea in a standard format.                                                                                                      |




### 2.1 Player profile (what to collect)

- **Identity & contact:** name, grad year, hometown/state, player email, phone (optional), parent contact.
- **Volleyball:** primary and secondary position, height, standing reach / approach touch and block touch (optional), dominant hand, jersey number, club team and level, club coach and recruiting coordinator (name, email, phone), high school team and coach.
- **Academics:** high school, GPA (unweighted and weighted), intended major(s), ACT/SAT score and test dates, NCAA/NAIA eligibility registration status, counselor contact.
- **Highlights & stats:** highlight video link(s), game-film link, season stats (kills, assists, digs, etc. by position), awards, upcoming tournaments.
- **Preferences (feeds search):** target levels (D-I, D-II, D-III, NAIA, JUCO), distance from home, region, school size, majors, scholarship need, "must start as a freshman vs. willing to earn a spot".
- Profile completeness score ("82%: add your highlight video") to drive completion.



### 2.2 



### 2.3 College database & search: how it should work

- **Records:** school, program level/division and conference, location, enrollment, public/private, majors offered (or major categories), cost/aid link, head coach and recruiting coordinator with email/phone (from the program's staff page), program page and social links, team record last season, and "last verified" date.
- **Filters:** division, state/region and distance from home, school size, majors, tuition range, conference, and keyword.
- **Search results show a "fit" badge, not a score yet:** match/no match against the player's stated preferences (distance, major, level).
- **Add to list in one tap.** The first time, offer a short guide: "Start with about 20–30 schools you find interesting, then narrow to 10–15."
- **Data trust:** every record shows "verified on date"; a "report a correction" button feeds an admin queue; the club coach can flag a coach change. Coaches change jobs every year, so stale data is the biggest product risk (see Section 8).



### 2.4 My College List: how it should work

- **Cap and funnel from the deck:** up to 30 colleges on the list, then the app prompts the player to narrow to the top 15 (juniors/sophomores) or 10 (seniors) as "active outreach", based on grade.
- **Priority 1–4:** 1 = top choice/dream, 2 = strong target, 3 = good fit, 4 = safety or backup. Enforce a balance guideline ("you have 12 priority-1 schools; most players do best with 3–5").
- **Stage:** researching → shortlisted → contacted → conversation → camp/visit → offer → committed / declined. Stage changes are logged.
- **College criteria worksheet** (deck, slide 10): the player scores each school on distance from home, family travel, her major, level of play, cost and scholarship need. This is a guided checklist per school with the weights set by the player, summed to a "my fit" number.
- **Compare view** for 2–4 schools side by side.



### 2.5 



### 2.6 Club coach dashboard: how it should work

- **Roster table:** player, team, grade, profile %, tasks done %, # colleges on list, last activity, count of overdue items. Filter by team, grade, coordinator. Sort by "needs attention".
- **Player detail:** her list and timeline (read-only by default); the coach can add a note, a contact, or an action item. Coach-added items are labelled with the author and visible to the player and parent.
- **Club college notes:** shared page per college ("Coach X is moving to Y", "Coach likes setters with a high release point", "Rockets have placed 3 players here"). This preserves the institutional knowledge that today lives in coordinators' heads.
- **Permissions:** coaches see only players on their team or assigned to them. Players can see which coaches have access. Parents can see all.
- **Broadcast:** send a team-wide announcement or reminder ("camp registration opens Friday").



### MVP: explicitly *out*

College coach accounts and player search; in-app sending of email; AI features; video upload/hosting; payments; native iOS/Android apps (the MVP ships as a mobile-first web app/PWA); NCAA Eligibility Center data integration; text messaging.

**Why leave out the college coach side?** It's a two-sided marketplace with a cold-start problem: coaches won't join until there are players, and they already use a free tool (University Athlete, per the deck). The MVP is more valuable and less risky without it. The shareable profile link gives coaches what they need in the meantime.

---



## 3. Later phases



### Phase 2: Communication that runs itself (about 2–3 months after MVP)

- **Gmail/Outlook connection (OAuth):** send from the player's own account; read-only matching of replies from tracked coaches so the log fills itself in. Opt-in; only messages to/from coaches on her list are read.
- **Reply handling:** when a coach replies, create a task ("reply within 24 hours", per the MRA guide) and suggest a response template.
- **Smart cadence engine:** weekly drafts queue per school ("Tuesday: 4 follow-ups are ready; add your new item and send"); pause for schools where the coach says "not a fit."
- **Phone-call prep:** question bank from the Rockets College Phone Interview doc; practice-call mode (parent or coordinator plays coach); notes template and post-call log. Scheduling a call and reminders.
- **Text/DM tracking** for coaches who text (seniors and juniors can receive texts per the deck).
- **Coach-side templates library** contributed by club coordinators.
- **Rules calendar v1 (contact / quiet / dead periods)** by division and sport, shown on each school card as "Can the coach reply now?" Data-driven so the club admin updates rules each year. (Contact rules matter: the deck says colleges can't contact sophomores until June 15.)



### Phase 3: Profile, video and academics

- **Highlight video manager:** store links (YouTube/Vimeo/Hudl), a checklist from the deck (best skill first, under 3 minutes, name/club/jersey/position/height/grad year, circle yourself, celebrations), reminders to refresh it each season, and version history. A later option is upload and light editing, or marketplace links to editors.
- **Public profile page** upgrades: custom URL, themes, QR code for tournament badges and flyers, view counts ("viewed by 4 college domains").
- **Academic eligibility tracker:** core-course checklist, GPA calculator, ACT/SAT planner and date registration reminders, counselor meeting agenda, NCAA/NAIA eligibility registration status.
- **Social media audit checklist and weekly post prompts** (once a week per the deck, hashtag your club).
- **Document vault:** transcript, test scores, eligibility letters, recommendation letters, shareable by permission.



### Phase 4: Events, camps and visits

- **Calendar:** tournaments, camps, visits, tests, deadlines; sync to Google/Apple calendar.
- **Camp planner:** list camps by school, dates, cost, "elite camp" flag, a pace guide ("don't go to every camp"; the deck says keep your legs and arm fresh), registration status.
- **"Who's watching" tournament prep:** before a tournament, show which list schools might attend (from coach input, club knowledge, and published attendance lists) and prompt "email these 6 coaches your court and times."
- **Visit planner:** unofficial and official visit checklists, questions to ask, a trip log, expense tracking, post-visit rating that feeds the fit score.
- **Offer tracker and decision timeline** once offers arrive.



### Phase 5: College coach side and marketplace

- College coach accounts (verified by .edu email plus staff-page match).
- Search players by class, position, height, GPA/test score, region and availability; save and message candidates; recruiting questionnaires inside the app.
- Player controls: which fields coaches see, who can message her. Message limits to prevent spam.
- Alerts to coaches ("a Class of 2028 setter from Iowa with 3.8 GPA just updated her video").
- Possible revenue: coach/program subscriptions. *Players remain free.*



### Phase 6: Intelligence and scale

- **Fit and reach recommendations:** suggest schools using the player's profile, stats, academics, and preferences.
- **Roster needs analysis:** from public rosters, show graduating players by position per school ("this program loses 2 setters in 2028").
- **AI assistant:** draft or edit emails in the player's voice, summarize a coach's reply and suggest a next step, review a highlight video script, and answer "what should I do next?". Always show what it wrote and let the player edit.
- **Financial tools:** cost comparison, scholarship/aid notes, award letter comparison.
- **Native iOS/Android apps** if PWA usage justifies it.
- **More sports** via configuration packs (positions, stat fields, checklists, rules calendars).
- **Transfer and JUCO pathway** planning (deck: "could you use more development in junior college, then transfer?").
- **Club analytics:** placement outcomes, which schools their players commit to, season-over-season trends.

---



## 4. Additional feature ideas worth considering


| Idea                                                                                      | Why it helps                                                                      |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| "This week's 3" home screen and streaks                                                   | Habit formation; teens respond to short, visible goals                            |
| Parent mode with a lighter view and a weekly summary email                                | Parents are the project managers; keeps them informed without nagging the player  |
| Contact-status lights on each school (green: warm, yellow: waiting, red: silent 4+ weeks) | At-a-glance triage                                                                |
| Coach-change alerts                                                                       | Biggest cause of wasted emails is stale contacts                                  |
| Rejection and "not a fit" handling with encouragement                                     | The MRA guide's "don't get discouraged" theme; protect motivation                 |
| Expectation setting by position and level                                                 | The deck notes positions have different priority; help realistic list building    |
| Shared "wins" feed within the club (opt-in)                                               | Motivation and visibility for the club                                            |
| Printable one-page summary / PDF                                                          | For tournaments, visits, and families who prefer paper                            |
| Recruiting-service-neutral import/export                                                  | Families often use NCSA/FieldLevel too. CSV export of list and log avoids lock-in |
| Accessibility and Spanish language support                                                | Wider reach                                                                       |
| Offline-friendly notes                                                                    | Camps and tournaments often have poor signal                                      |


---



## 5. Suggested release timeline


| Phase | Theme                     | Rough duration                                           | Exit criteria                                                                                                                                            |
| ----- | ------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Validate and prepare      | 3–4 weeks                                                | 8–10 interviews (players, parents, coordinators); decision on data sourcing; legal review of minors' privacy; clickable prototype tested with 5 families |
| 1     | **MVP**                   | ~10–12 weeks build, then 1 season pilot with the Rockets | ≥70% of invited players finish onboarding; ≥50% active weekly; coordinators say it saves them time                                                       |
| 2     | Communication             | ~8–10 weeks                                              | ≥40% of active users connect email; follow-up cadence met on most outreach schools                                                                       |
| 3     | Profile, video, academics | ~8 weeks                                                 | Most profiles complete; video link on ≥80%                                                                                                               |
| 4     | Events, camps, visits     | ~8 weeks                                                 | Calendar used around tournament weekends                                                                                                                 |
| 5     | College coach marketplace | ~12 weeks                                                | Coach verification process works; coaches from ≥50 programs actively use search                                                                          |
| 6     | Intelligence & scale      | Ongoing                                                  | Based on usage data                                                                                                                                      |


*(Durations assume a small team of 2–3 engineers plus part-time design. Adjust once the team is known.)*

---



## 6. Suggested technical approach (MVP-level)

- **Client:** responsive web app installable as a PWA (push notifications, offline notes). One codebase; avoids app-store review during the pilot. Re-evaluate native after Phase 3.
- **Back end:** managed Postgres plus an auth service (for example Supabase or Firebase plus a small API layer). Row-level security by club and role.
- **Key data model:** `Club → Team → Player ↔ Parent`; `Coach ↔ Team`; `College(Program)` and `ProgramStaff`; `PlayerCollege` (priority, stage, scores); `Contact` (type, date, direction, summary); `Note`; `Task` templates and `PlayerTask`; `Reminder`; `RuleCalendar`; `SportConfig`.
- **Sport configuration:** positions, profile stat fields, checklist templates, rule calendar and email templates stored per sport.
- **Notifications:** push plus email digest; SMS only if cost and consent are justified later.
- **Data pipeline:** an internal admin tool for importing and verifying program data, with last-verified stamps and a correction queue.
- **Analytics:** event tracking from day one (onboarding completion, tasks done, emails logged, coach actions).

---



## 7. Success measures

- **Activation:** % of invited players completing profile + first 5 colleges within 7 days.
- **Engagement:** weekly active players; tasks completed per week; contacts logged per active list school.
- **Outcome proxies:** coach replies logged per player; campus visits and camps planned; offers recorded.
- **Club value:** coordinator time saved (survey); % of players with an active list; NPS from families and coaches.
- Do **not** promise scholarships or offers; the app improves organization and consistency.

---



## 8. Risks and how to handle them


| Risk                                                                                                            | Mitigation                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **College coach contact data goes stale or has licensing limits**                                               | Start with a verified seed set (program staff pages are public), a "last verified" date on every record, crowdsourced corrections confirmed by an admin, and annual refresh before the recruiting season. Check each source's terms; consider licensing a dataset if scraping is not allowed. |
| **Privacy of minors** (grades, contact info, location)                                                          | Parent-linked accounts; collect the minimum; no public listing by default; coach access only with club membership; clear consent; data export/delete; COPPA and state law review; no selling data. Treat the roster file as sensitive.                                                        |
| **Recruiting rules are complicated and change** (deck: dead/quiet periods differ by NCAA I/II/III, NAIA, NJCAA) | Rules are data, not code; sourced and dated; show "as of" and link to official NCAA/NAIA pages; admin review each year; avoid giving legal advice.                                                                                                                                            |
| **Email spam / bad habits**                                                                                     | Required personalization and "new info" fields; throttle per school; no bulk-send; templates follow the deck's tone guidance.                                                                                                                                                                 |
| **Low adoption by teens**                                                                                       | Short sessions, push reminders, parent and coach involvement, rewards for streaks; club-led onboarding.                                                                                                                                                                                       |
| **Cold start / coach side**                                                                                     | Defer the marketplace; the shareable profile gives value now.                                                                                                                                                                                                                                 |
| **Competition** (NCSA, FieldLevel, Captain U, etc.)                                                             | Differentiate on price (free for players), club collaboration, and guided simplicity. Offer export so users aren't locked in.                                                                                                                                                                 |
| **Scope creep**                                                                                                 | Hold the MVP list; features move to later phases only with usage evidence.                                                                                                                                                                                                                    |


---



## 9. Open questions for you

1. **Business model / who pays:** free for players and paid by clubs (per-roster fee)? Or club-sponsored (Rockets only, free)? This changes how much to invest in the multi-club features.
2. **Pilot scope:** the Iowa Rockets only, or open to other clubs from the start?
3. **Which sports/genders after volleyball?** (Affects the sport-config design early on.)
4. **Data source:** who maintains the college coach list for the pilot? A one-time import by the coordinators, or a vendor/dataset?
5. **Existing tools:** keep using University Athlete and the Rockets player web pages (link out), or replace the player page with our profile link?
6. **Build approach:** custom build, or a no-code/low-code prototype first (for example Airtable/Glide) to validate with the Rockets before investing?
7. **Platform preference:** is a PWA acceptable for the pilot, or are native app-store apps required?

