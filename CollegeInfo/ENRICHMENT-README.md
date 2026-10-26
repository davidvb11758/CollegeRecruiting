# College files: IPEDS enrichment (one-time load)

Done 2026-10-26; review fixes applied the same day. The five college CSVs now carry extra columns. The original files are untouched in `original\`.

## What changed

| File | What it is |
|---|---|
| `ncaa_d1_vb_colleges_with_unitid.csv`, `ncaa_d2_...`, `ncaa_d3_...`, `NAIA_vb_...`, `njcaa_vb_...` | **Updated in place.** All original columns and values are unchanged and in the same order. 19 new columns are added on the right. The empty trailing column in the NJCAA file was dropped. |
| `major_category.csv` | 25 major categories (code, label, the IPEDS CIP series they cover). Lookup table to load. |
| `college_major.csv` | `unitid, category_code` pairs (26,297 rows). One row per category a college awards degrees in. |
| `zip_location.csv` | 33,144 U.S. ZIP codes with latitude/longitude (Census 2020 ZIP-area centers). For the athlete's home ZIP in the distance filter. |
| `unitid_review.csv` | The 149 rows flagged for review, with the owner's decisions in the `The FIX` column (all applied). |
| `original\` | Backup of the five CSVs exactly as you provided them. |

## New columns on the five files

| Column | Meaning | Source |
|---|---|---|
| `ipeds_unitid_check` | `ok`, `name_differs`, `shared_campus`, `campus_check`, or `unitid_wrong` (see below) | our check |
| `proposed_unitid` | Suggested replacement UNITID where the current one looks wrong (blank if none) | our review |
| `ipeds_name` | Name of the institution the current UNITID points to | IPEDS HD2024 |
| `zip` | 5-digit ZIP | HD2024 |
| `website_url`, `net_price_url` | Main website; net-price-calculator page (for the "cost link") | HD2024 (`https://` added when missing) |
| `latitude`, `longitude` | Campus coordinates | HD2024 |
| `ipeds_control` | Public / Private nonprofit / Private for-profit | HD2024 |
| `campus_setting`, `locale_code` | Urban / Suburban / Rural, and the raw IPEDS locale code | HD2024 (city = Urban, suburb = Suburban, town and rural = Rural) |
| `undergrad_enrollment`, `enrollment_term` | Undergraduate headcount, "Fall 2023" | IPEDS EF2023A |
| `tuition_in_state`, `tuition_out_of_state`, `tuition_year` | Published tuition only (no fees), 2023-24 | IPEDS IC2023_AY |
| `admit_rate`, `selectivity` | Admitted / applied, fall 2023; band below | IPEDS ADM2023 |
| `major_categories`, `major_category_count` | Semicolon list of category codes | IPEDS Completions C2024 (2023 as fallback) |

**Selectivity bands (easy to change):** under 25% admitted = Highly selective; 25-49% = Selective; 50-84% = Moderately selective; 85% and up = Open. Two-year colleges with no admissions data are set to Open. Blank means no admissions data was reported.

**Majors:** a category counts as "offered" when the college awarded at least one associate's or bachelor's degree in it in the latest year of data. The categories group IPEDS two-digit CIP families (for example Health professions = CIP 51, Exercise science, sport & recreation = CIP 31).

## Coverage

After the review fixes below, all 1,662 rows are enriched, and every UNITID is now unique.

| File | Rows | Enriched | Selectivity filled |
|---|---|---|---|
| NCAA D-I | 347 | 347 | 343 |
| NCAA D-II | 282 | 282 | 259 |
| NCAA D-III | 416 | 416 | 411 |
| NAIA | 203 | 203 | 171 |
| NJCAA | 414 | 414 | 319 |

## The UNITID check

The `HD2025_INSTNM` column in the source files is simply the IPEDS name of the UNITID in that row, so it cannot show whether the UNITID is right. Each row's `College_Name` and city were compared with the IPEDS record instead. The first pass found 11 wrong UNITIDs; all were resolved in the review below.

| Status | Rows | Meaning |
|---|---|---|
| `ok` | 1,637 | Name matches the IPEDS record |
| `name_differs` | 20 | Same city and state, different wording (SUNY prefixes, IUPUI). Reviewed and kept. |
| `shared_campus` | 2 | Bloomsburg and Lock Haven, campuses of Commonwealth University of Pennsylvania (their IPEDS data is the combined institution) |
| `campus_check` | 3 | Probably right, but the IPEDS record is a different campus of the same institution, so coordinates may be a few miles off |

UNITIDs are now unique across the five files (1,662 rows, 1,662 ids). Multi-campus institutions (Minnesota North, Commonwealth University of Pennsylvania, Vermont State, Coastal Alabama) still have a single IPEDS record, so campus-level distance is approximate.

## Review fixes applied (2026-10-26)

The owner's decisions in the `The FIX` column of `unitid_review.csv` were applied to copies of the files in `original\`, and the enrichment was re-run on the result. `unitid_review.csv` is left as the owner edited it, so it is the record of the decisions.

- **UNITID changed (9 rows):** Indiana Tech, Penn State (D-I), Rutgers, Bloomsburg, California U of PA, Florida Tech, Davidson County CC, Frontier CC, Marian's Ancilla.
- **Rows removed (7):** Clarion (D-II), Edinboro (D-II), The King's College - New York (D-III), Utah State University Eastern (NJCAA; it has no IPEDS record of its own), Coastal Alabama - Brewton (NJCAA), Vermont State - Castleton and Johnson (D-III). California U of PA now stands for the Pennsylvania Western campuses.
- **City changed:** Rutgers (New Brunswick), Keiser (Ft Lauderdale), Ottawa University - Arizona (Surprise), Bryant & Stratton - Virginia (Virginia Beach), Metropolitan CC (Kansas City).
- **Name changed to the IPEDS name** (city and state suffix dropped) on every row marked "change name per field unitid_currently_points_to", plus the two explicit renames (Davidson-Davie Community College; Pennsylvania Western University - California/Clarion/Edinboro).
- **Penn State:** the fix said 214177, which is not an IPEDS id; 214777 (Pennsylvania State University-Main Campus, University Park) was used and confirmed by the owner.
- **Campus ids that are not IPEDS ids (owner-assigned):** Minnesota North - Mesabi Range = 17373502, Minnesota North - Vermilion = 17373505, Lock Haven = 213613. None exists in IPEDS HD2024. These rows carry the parent institution's IPEDS data (Minnesota North 173735, Commonwealth University of Pennsylvania 498562), so their coordinates, enrollment, tuition and majors are the parent's. `ipeds_name` shows the parent's name.
- **Not changed:** the `HD2025_INSTNM` column still holds the old UNITID's IPEDS name on rows whose UNITID changed (`ipeds_name` has the current one). Coach, rank and other source columns are untouched.

`ipeds_unitid_check` and `proposed_unitid` were recomputed; `proposed_unitid` is now blank everywhere.

## Other observations

- IPEDS HD2025 does not exist yet on the NCES site (the newest institution file is **HD2024**). Enrollment is **fall 2023** (fall 2024 enrollment was not available), tuition and admissions are **2023-24 / fall 2023**, and majors are from the **2023-24 completions** data. Rows for newly renamed or merged schools can lag.
- 3 rows have a public/private label in the source that disagrees with IPEDS control. The source label is kept; the IPEDS value is in `ipeds_control`.
- Columns you said not to import (AVCA_Rank, RPI_Rank, Region, Reg_Rank, college_name_from_reg_rank_file, Match_Score, MASSEY_college_name) are still in the CSVs, unchanged, so the files match your originals. The loader should skip them.
- Coach data was not touched. NJCAA coach names and emails remain mostly blank.

## Sources (all public domain, downloaded from the federal sites)

- NCES IPEDS Data Center: `HD2024` (directory/location), `EF2023A` (fall enrollment), `IC2023_AY` (tuition), `ADM2023` (admissions), `C2024_A` and `C2023_A` (completions by field).
- U.S. Census Bureau 2020 Gazetteer, ZIP Code Tabulation Areas (`zip_location.csv`).
