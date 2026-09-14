# Vault index — YCLAP conversations in polkadoc

The polkadoc vault (`~/polkadoc`, Obsidian markdown, one folder per conversation) holds
every Messenger, Telegram and email thread about Youth CLAP. This page lists each one,
what has been mined from it, and where that landed in the repo. The main file for each
conversation is `<folder>/<name>.md`; `_Overview.md` carries the counts.

**Skip `attachments/` text.** It is OCR output and garbled. Quote chat text only.

**Citation format** used in repo docs: `chat name · YYYY-MM-DD HH:MM`.

**Redaction rule for anything mined:** no meeting passcodes, Zoom/Meet links or PINs,
phone numbers, wifi passwords, plate numbers, or personal emails. Official org
addresses (e.g. `partnershipsandcampaign@climate.gov.ph`) are fine.

Counts are from each `_Overview.md`. "Last scrape" is the overview file's modification
time on the Mac.

---

## Messenger

| Conversation | Messages | Date range | Last scrape | Mined into |
|---|---|---|---|---|
| `Messenger/Ateneo CCC YCLAP/` — staff chat with Ms. Shenina (SEEDS) and Jack Lorenz (OSCI) | 368 (≈341 after dedupe) | 2026-08-08 → 2026-09-14 | 2026-09-14 10:42 | To 08-25: [`../plaud/README.md`](../plaud/README.md) (vault corroboration). To 09-09 morning: [`../showcase/vault-intel-2026-09-09.md`](../showcase/vault-intel-2026-09-09.md). 09-09 → 09-14: [`../showcase/vault-intel-2026-09-14.md`](../showcase/vault-intel-2026-09-14.md) |
| `Messenger/yclap magisphere 🌏🦅/` — team chat (2 threads: 927 + 405) | 1332 | 2026-08-19 → 2026-09-14 | 2026-09-14 12:10 (merged 2026-09-14) | [`../showcase/vault-intel-2026-09-09.md`](../showcase/vault-intel-2026-09-09.md), [`../showcase/vault-intel-2026-09-14.md`](../showcase/vault-intel-2026-09-14.md) |
| `Messenger/yclap participants/` — the same team group before its 09-08 rename (inference: identical messages 09-05 → 09-08 in both) | 371 | 2026-08-19 → 2026-09-08 | 2026-09-13 17:26 | Aug 26 group/slide assignments cross-checked in [`../plaud/2026-08-26-lingguhang-pulong.md`](../plaud/2026-08-26-lingguhang-pulong.md). Aug 29 mentor feedback notes ("Engagement … Partnership …") not separately mined |
| `Messenger/Purpose (Campaign Canvas)/` — sub-group (Sophia, Aleij Jill, Angelo) drafting Purpose / background / goal / objectives | 30 | 2026-08-27 → 2026-09-04 | 2026-09-13 17:26 | Not mined. The content went into the concept note and pitch deck (Aleij, 09-04 20:50); the repo's version is [`../showcase/concept-note.md`](../showcase/concept-note.md) |

### Known export quirks

- **Ateneo CCC YCLAP** duplicates most of Ms. Shenina's messages (once with a weekday
  stamp, once with a clock stamp). It also files a block of Sep 5–8 messages under a "Sep 9"
  header, after the real Sep 9 lines. Dedupe on sender + text, and re-date from the weekday
  stamp ("Saturday 11:53am" in that block is 09-05).
- Relative stamps (`_Wednesday 7:18pm_`) appear throughout the Messenger exports; the
  enclosing `## YYYY.M.D` header is the scrape-day bucket, not always the send date.

### Misfiled folder — fixed

A polkadoc category-leak bug filed the team chat's newer thread (Messenger thread id
`30215894008058594`, 405 messages, 2026-09-05 → 2026-09-14) under an unrelated folder named
`Messenger/REVELO - LAS 111 A1_ missed exam (14 Sep), request for make-up/`, as
`yclap magisphere 🌏🦅.md`. That was not an exam thread.

**Fixed 2026-09-14:** merged into `Messenger/yclap magisphere 🌏🦅/`, now 2 threads and
1332 messages. The stray folder was moved out of the vault; the backup is at
`~/polkadoc-backup-20260914-misfile/`. Cite those messages as `yclap magisphere 🌏🦅`.
If the bug recurs on a later scrape, look for a `yclap magisphere 🌏🦅.md` inside any
non-YCLAP folder.

---

## Telegram

| Conversation | Messages | Date range | Last scrape | Mined into |
|---|---|---|---|---|
| `Telegram/Youth CLAP (Innovators GC)/` — CCC's cohort-wide group for all nine schools (CCC staff, Anna Oposa, school reps) | 52 | 2026-08-18 → 2026-09-12 | 2026-09-14 13:00 (first import) | [`../showcase/vault-intel-2026-09-14.md`](../showcase/vault-intel-2026-09-14.md): postponement to 09-26, deck + concept-note deadline moved to **09-23**, the Session 4 six-part pitch guide. Also a ROADMAP NEXT row |

Also in it, not mined: the Session 3 (Aug 29, DEEPEN) program PDF, the CCC Viber community
and hashtags, the mWell challenge, and the 09-05 mentoring-session schedule. It also holds
session wifi and meeting passcodes; do not copy those.

---

## Email

All scraped 2026-09-13 17:26. Folder names are shown up to the address suffix polkadoc
appends. The certification thread's student number is elided here.

| Folder (`Email/…`) | Messages | Date range | Mined into |
|---|---|---|---|
| `CCC YCLAP Email Thread for Announcements and Reminders` | 6 | 2026-08-08 → 2026-08-22 | 2026-08-25 pass → [`../plaud/README.md`](../plaud/README.md) |
| `[External] [Youth CLAP] Session 1 Materials and Reminders` | 2 | 2026-08-15 → 2026-08-20 | 2026-08-25 pass → [`../library.md`](../library.md), [`../evaluation/pre-post-test.md`](../evaluation/pre-post-test.md) |
| `URGENT_ Confirmation of Permission and Change of Venue for CCC-YCLAP – August 22` | 2 | 2026-08-20 → 2026-08-25 | 2026-08-25 pass → [`../plaud/README.md`](../plaud/README.md) (Mapúa Makati, not Intramuros) |
| `Fwd_ [External] Youth CLAP Onsite Sessions Advisory and Waiver Forms` | 1 | 2026-08-21 | 2026-08-25 pass → [`../plaud/README.md`](../plaud/README.md) |
| `Request to certify - Revelo, Mar Angelo N. (…), Youth CLAP off-campus` | 2 | 2026-08-21 → 2026-09-01 | 2026-08-25 pass (off-campus clearance; see [`../health-assessment-off-campus.md`](../health-assessment-off-campus.md)) |
| `[External] Invitation_ Youth CLAP - Admu @ Sat Sep 5, 2026 11am - 12pm (GMT+8) (…)` | 1 | 2026-09-01 | 09-14 pass: Anna Oposa's mentorship call to "walk through your campaign canvas and pitch deck" |
| `Attend the CCC Youth CLAP Innovation Showcase as a participant on September 12!` | 1 | 2026-09-07 | 09-14 pass: SEEDS offers 10 ADMU observer slots; applications closed 09-08 noon; needs OHS + OGC off-campus clearance |
| `Updated invitation_ [YCLAP] 1st Realignment Meeting @ Tue Sep 8, 2026 7am - 7_30am (GMT+8) (…)` | 1 | 2026-09-07 | 09-14 pass: Ivan's team realignment, moved from 06:30 to 07:00–07:30 |
| `Invitation_ [YCLAP] Open Room  @ Wed Sep 9, 2026 3_30pm - 5pm (GMT+8) (…)` | 1 | 2026-09-07 | 09-14 pass: the Sep 9 open-room block before the consultation (went online that day) |

---

## Coverage

| Window | Doc |
|---|---|
| Aug 8 → Aug 25 | [`../plaud/README.md`](../plaud/README.md) vault corroboration note; [`../library.md`](../library.md) |
| Aug 26 → Sep 9 morning | [`../showcase/vault-intel-2026-09-09.md`](../showcase/vault-intel-2026-09-09.md) |
| Sep 9 → Sep 14 10:41 | [`../showcase/vault-intel-2026-09-14.md`](../showcase/vault-intel-2026-09-14.md) |

The next pass starts after `Ateneo CCC YCLAP · 2026-09-14 10:41` and
`yclap magisphere 🌏🦅 · 2026-09-14 11:46`.
