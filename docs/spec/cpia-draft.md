# Magisphere — Child Privacy Impact Assessment (DRAFT for the university DPO)

**Status: draft, not approved.** Written 2026-10-01 by the Magisphere team for the university's Data Protection Officer to review, amend and sign before any pilot with students. It is not legal advice, and nothing here has been reviewed by the NPC or the university.

**Why this exists.** The NPC's guidance on child-oriented transparency treats anyone **below 18** as a child, and says an advisory cannot set an age of digital consent. It asks controllers to fold a **Child Privacy Impact Assessment** into their Privacy Impact Assessment before launching anything children are likely to use ([NPC FAQ, Q2, Q6, Q9](https://privacy.gov.ph/wp-content/uploads/2024/12/FAQs-Advisory-on-Guidelines-on-Child-Oriented-Transparency.pdf)). First-year students and visiting senior-high students may be under 18.

**Who is the controller?** Open. Either the university (with the team as processor) or the team itself. The answer decides who registers, appoints the DPO and notifies breaches (RA 10173; NPC Circular 2022-04). **Decide this first.**

## 1. What is collected, where it goes, how long it stays

Read from the code on `reveal-1015`, 2026-10-01.

| Data | Where it lives | Who can see it | Kept for |
|------|----------------|----------------|----------|
| Journal: species, photo, note, exact position, time | **The phone only** (localStorage) | The student | Until they clear it |
| Shared find: species, name, position, time; never photo or note | Campus server (`/sync`) | Every phone: species, place, time, and the display name or "A walker" if hidden. Threatened species without position | **150 days** from 10-01 (`RETENTION_DAY`; was no limit, F-1) |
| Player row: display name, level, stage, points, streak | Campus server | Every phone: name and level on the board | 150 days after last activity, once no finds remain (F-1) |
| Live position while walking (hall) | Server memory only | Every phone in the hall, unless "Hide me from the live map" is on | Forgotten 60 s after the last update |
| Account (optional): username, password hash, Google subject id, display name | Campus server | The student; nobody else | **No limit set** (F-1) |
| Account backup (optional): journal rows with exact positions; **no photos, no notes** since 10-01 (F-2) | Campus server | The student | **No limit set** |
| Problem report: category, text, build, device, frame rate; position only if ticked, ~11 m | Campus server | Moderators | 30 days |
| Moderation audit: action, walker hash, display name, moderator | Campus server | Moderators | Pilot lifetime |
| Identify photo | Sent to Pl@ntNet (or iNaturalist with permission) only when the student taps identify | The identify service | Not stored by Magisphere; the service's own terms apply |

**What is never collected:** age, school, email address (Google sign-in keeps only the subject id), contacts, photos (on the server), or IP addresses in reports.

## 2. Risks to a child, and what already reduces them

| Risk | Already in place | Residual |
|------|------------------|----------|
| A stranger sees a named child's live position | Walker hash, not the account id. Positions only inside the campus frame. "Hide me from the live map" also anonymises finds. Hide / report on every name tag. `/mod` hides a walker | **The hall shows everyone to everyone by default** |
| Someone follows a child (Safe Spaces Act, [RA 11313 §12](https://lawphil.net/statutes/repacts/ra2019/ra_11313_2019.html)) | Report and hide; audit log | No escalation path to the university's CODI written down yet (RA 11313 §22) |
| An offensive or identifying display name | Server-side name filter | A child can still type their real full name |
| A threatened species' location exposed | Shared without position | Only curated species carry a status |
| Account backup holds exact positions | Photos and (since 10-01) notes stripped | Positions stay so a second phone can restore the journal |
| Data kept forever | Reports 30 days, live positions 60 s, shared finds 150 days (since 10-01) | Accounts have no limit |

## 3. Decisions for the DPO

1. **The live-visibility default for the pilot:**
   - (a) everyone sees everyone, with a hide switch (today);
   - (b) walking partners only;
   - (c) nobody until the student opts in.

   The team recommends **(b) or (c)** for any cohort with students under 18. Snap Map shares location with nobody by default ([Tom's Guide](https://www.tomsguide.com/us/snapchat-snap-maps-tracking,news-25390.html)).
2. **Consent.** RA 10173 §3(b) needs consent to be *evidenced* ([text](https://privacy.gov.ph/data-privacy-act/)). Is a recorded tick on the boot card enough for adults, and what does the university require for under-18s (a parent or guardian)?
3. **Retention (F-1).** Shared finds and inactive player rows are now deleted after **150 days** (one term + 30 days), per RA 10173 §11(e); `RETENTION_DAY` changes it. Still to decide: accounts, proposed at **12 months** of inactivity.
4. **F-2.** Done by default on 10-01: account backups no longer carry notes (the phone that wrote a note keeps it). Decide whether backups should also round positions.
5. **CODI escalation.** Name the committee a stalking or harassment report goes to, and how.

## 4. Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| University DPO | | | |
| Program owner (office) | | | |
| Magisphere developer of record | | | |

Until this table is filled, the reveal plan's kill switch applies: **no signed CPIA by 2026-10-13 → the reveal runs with the live hall off (`HALL_OFF=1` on the Worker), and the pilot does not start** (`docs/brainstorm/magisphere-institution/blueprint.md` §13).
