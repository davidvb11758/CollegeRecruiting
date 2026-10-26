# College data load report

Generated 2026-10-26 18:36 UTC by `scripts/load-colleges.mjs` (loaded).

## What was loaded

| Table | Rows |
|---|---|
| conference | 234 |
| college | 1662 |
| college_program | 1662 (NCAA_D1 347, NCAA_D2 282, NCAA_D3 416, NAIA 203, NJCAA 414) |
| college_coach (shared) | 2043 |
| college_major | 26351 |
| zip_location | 33144 |

Every program is a women's volleyball program with `last_verified_on` = load date and source "Provided CSV (Oct 2026)". Massey rank goes to `division_rank` (season label "Massey CSV, Oct 2026"); the Massey rating goes to `rating`; the Tier column is not imported. The primary recruiting contact is the recruiting coordinator if there is one, otherwise the head coach.

## Cleaning applied (59)

- coach: NCAA_D1 James Madison University: one person listed in several coach slots was loaded once (Travis Magorien: assistant+recruiting_coordinator)
- coach: NCAA_D1 Drake University: one person listed in several coach slots was loaded once (Addison Barnes: assistant+recruiting_coordinator)
- coach: NCAA_D1 Western Michigan University: one person listed in several coach slots was loaded once (Ryan Manning: assistant+recruiting_coordinator)
- coach: NCAA_D1 Eastern Illinois University: one person listed in several coach slots was loaded once (Paige Gardella: assistant+recruiting_coordinator)
- coach: NCAA_D1 California State University - Fresno: one person listed in several coach slots was loaded once (Jerome Fraisse: head+recruiting_coordinator)
- coach: NCAA_D1 Youngstown State University: one person listed in several coach slots was loaded once (Maddie Clayton: assistant+recruiting_coordinator)
- coach: NCAA_D1 Lehigh University: one person listed in several coach slots was loaded once (Gabriel Woffindin: assistant+recruiting_coordinator)
- coach: NCAA_D1 University of South Carolina - Upstate: one person listed in several coach slots was loaded once (Justin Sanders: assistant+recruiting_coordinator)
- email: NCAA_D1 University of North Carolina Asheville: several addresses "dmarante@unca.edu / volleyball@unca.edu" -> kept the first (dmarante@unca.edu)
- coach: NCAA_D1 Eastern Washington University: one person listed in several coach slots was loaded once (Adrian Leiser: assistant+recruiting_coordinator)
- coach: NCAA_D1 University of Rhode Island: one person listed in several coach slots was loaded once (Marissa Soistman: assistant+recruiting_coordinator)
- coach: NCAA_D1 Mercyhurst University: one person listed in several coach slots was loaded once (Jenell Patton: assistant+recruiting_coordinator)
- coach: NCAA_D1 Citadel Military College of South Carolina: one person listed in several coach slots was loaded once (Erin Kretzschmar: assistant+recruiting_coordinator)
- name: NCAA_D2 Eckerd College: "Kali Boatwright '18" -> "Kali Boatwright"
- name: NCAA_D2 Florida Southern College: "Lauren Tekavec ‘15" -> "Lauren Tekavec"
- name: NCAA_D2 Florida Southern College: "Makena Wilson '20" -> "Makena Wilson"
- coach: NCAA_D2 Concordia University - Irvine: one person listed in several coach slots was loaded once (Alex Leja: assistant+recruiting_coordinator)
- email: NCAA_D2 Oklahoma Christian University: removed spaces "asa.freeman@oc .edu" -> "asa.freeman@oc.edu"
- coach: NCAA_D2 South Dakota Mines: one person listed in several coach slots was loaded once (Annika Stephens: assistant+recruiting_coordinator)
- coach: NCAA_D2 Shorter University: one person listed in several coach slots was loaded once (Josh Paul: assistant+recruiting_coordinator)
- name: NCAA_D2 Saint Michael's College: "Beth Syverson '23" -> "Beth Syverson"
- coach: NCAA_D3 Illinois Wesleyan University: one person listed in several coach slots was loaded once (Tyler White: assistant+recruiting_coordinator)
- coach: NCAA_D3 Washington University in St. Louis: one person listed in several coach slots was loaded once (Greg Selle: assistant+recruiting_coordinator)
- name: NCAA_D3 Washington & Lee University: "Bryan Snyder '95" -> "Bryan Snyder"
- name: NCAA_D3 Franklin & Marshall College: "Mary Kate Salko '01" -> "Mary Kate Salko"
- coach: NCAA_D3 Case Western Reserve University: one person listed in several coach slots was loaded once (Kim Waters: assistant+recruiting_coordinator)
- coach: NCAA_D3 Williams College: one person listed in several coach slots was loaded once (Adam Gulick: assistant+recruiting_coordinator)
- coach: NCAA_D3 Nebraska Wesleyan University: one person listed in several coach slots was loaded once (Nick Erdman: assistant+recruiting_coordinator)
- name: NCAA_D3 Hendrix College: "Jeanette Johnson '21" -> "Jeanette Johnson"
- name: NCAA_D3 Chapman University: "Mary Cahill '86" -> "Mary Cahill"
- name: NCAA_D3 Chapman University: "Corrine Blaine '14" -> "Corrine Blaine"
- email: NCAA_D3 Asbury University: removed spaces "Hanna. hostetler@yahoo.com" -> "hanna.hostetler@yahoo.com"
- name: NCAA_D3 Bethany Lutheran College: "Riley Felton '23, '25" -> "Riley Felton"
- name: NCAA_D3 Bethany Lutheran College: "Anna Taylor '25" -> "Anna Taylor"
- name: NCAA_D3 Monmouth College: "Kaylee Simpson '22" -> "Kaylee Simpson"
- name: NCAA_D3 Roanoke College: "Blair Trail-Bennett '99" -> "Blair Trail-Bennett"
- name: NCAA_D3 Roanoke College: "Scott Kelley '97" -> "Scott Kelley"
- name: NCAA_D3 Alma College: "Megan Greenup '23" -> "Megan Greenup"
- coach: NCAA_D3 Pacific University: one person listed in several coach slots was loaded once (Sara Parker: assistant+recruiting_coordinator)
- name: NCAA_D3 University of New England: "Adryona Miller '23" -> "Adryona Miller"
- name: NCAA_D3 St. Mary's College of Maryland: "Ashley Welch '23" -> "Ashley Welch"
- name: NCAA_D3 Keene State College: "Jenn Merrill '97" -> "Jenn Merrill"
- name: NCAA_D3 Rivier University: "Jeff Costa '05" -> "Jeff Costa"
- name: NCAA_D3 Rivier University: "Lydia Pray '23" -> "Lydia Pray"
- name: NCAA_D3 York College of Pennsylvania: "Nadaysia Nivar '24" -> "Nadaysia Nivar"
- name: NCAA_D3 United States Merchant Marine Academy: "Kyleigh Kappas '20" -> "Kyleigh Kappas"
- coach: NCAA_D3 Brevard College: one person listed in several coach slots was loaded once (Eric Friedt: assistant+recruiting_coordinator)
- name: NCAA_D3 Cairn University-Langhorne: "Allison Barnes '23" -> "Allison Barnes"
- name: NCAA_D3 Western New England University: "Samantha Shomo '11" -> "Samantha Shomo"
- name: NCAA_D3 SUNY Plattsburgh: "Tyler Harsch '24" -> "Tyler Harsch"
- name: NCAA_D3 Nichols College: "Jack Normandin '25" -> "Jack Normandin"
- name: NCAA_D3 Elmira College: "Savannah Terry '21" -> "Savannah Terry"
- name: NCAA_D3 Elmira College: "Jordan Peiser '24" -> "Jordan Peiser"
- name: NCAA_D3 Dean College: "Tyler Martins '23" -> "Tyler Martins"
- name: NCAA_D3 Pratt Institute: "Natalie Dziadzio '25" -> "Natalie Dziadzio"
- email: NCAA_D3 Virginia Wesleyan University: several addresses "kcumberbatch@vwu.edu | mensvolleyball@vwu.edu" -> kept the first (kcumberbatch@vwu.edu)
- name: NJCAA Itawamba Community College Æ’?? Fulton Campus: "Itawamba Community College Æ’?? Fulton Campus" -> "Itawamba Community College - Fulton Campus"
- conference: NJCAA: spellings "Big 8 Conference", "BIG 8 Conference" merged into "Big 8 Conference"
- control: 3 rows where the file's Public/Private label disagrees with IPEDS; IPEDS value stored

## Warnings (0)

None.

## Checks after the load

- PASS: row count college (1662 loaded, 1662 expected)
- PASS: row count college_program (1662 loaded, 1662 expected)
- PASS: row count conference (234 loaded, 234 expected)
- PASS: row count college_coach (2043 loaded, 2043 expected)
- PASS: row count college_major (26351 loaded, 26351 expected)
- PASS: row count zip_location (33144 loaded, 33144 expected)
- PASS: every program has a college and a division
- PASS: no program without a conference except where the file had none
- PASS: no coach listed twice in a program
- PASS: programs whose coaches share one team inbox (expected, informational) (21 programs; email is deliberately not unique)
- PASS: at most one primary recruiting contact per program
- PASS: every program with a coach has a primary contact
- PASS: no audit rows were written by the bulk load
- PASS: bands NAIA (20/20/20/21/20/102 of 203)
- PASS: bands NCAA_D1 (34/35/35/34/35/174 of 347)
- PASS: bands NCAA_D2 (28/28/28/28/29/141 of 282)
- PASS: bands NCAA_D3 (41/42/41/42/42/208 of 416)
- PASS: bands NJCAA (41/41/42/41/42/207 of 414)
- PASS: spot check of 20 random colleges against the CSV (20/20 match)
- PASS: program_search over all programs runs in under 2 seconds (109.046 ms)
