# Showcase intel from the vault — read before Wednesday

Mined 2026-09-09 from `~/polkadoc` — the **Ateneo CCC YCLAP** chat (the official one
with Ms. Shenina and Jack Lorenz), the **yclap magisphere 🌏🦅** group, and the Session 2
and 3 shared Drive.

Everything below is quoted or paraphrased from a dated message. Where I am inferring, it
says so.

---

## 1 · The thing with a deadline this morning

> **Charisse (09-08, 18:45):** "we plan to print 3 pubmats, so 3 sintra boards po siya:
> 2 A4 size, 1 na katulad sa photo sent here po"
> **Shenina (20:15):** "This is a3" … "Will try to ask intermatrix tomorrow. **Kaya ba ng
> morning isend sa amin?**"
> **Katherine (20:18):** "yes po kaya naman po"

**So: 2 × A4 + 1 × A3, design due to Ms. Shenina as a PNG this morning (Sep 9).**

### RESOLVED, 09-09 — the boards say Magisphere

The Canva export (`~/Downloads/[ADMU YCLAP] Publication Material and QR.zip`,
nine A4 SVGs) carries the final material and it is branded **Magisphere /
*Rediscovering home.*** throughout. The name question below is closed; it is
kept for the record because it explains why the app was briefly repainted from
the wrong palette.

**Two things to carry forward from that export:**

- **Board 9 is the old "ecomon" kit sheet** — booth mockup, bark/lime/
  ultramarine swatches, the ecomon wordmark, Garet. It is superseded. Do not
  send it to Intermatrix with the others.
- **Board 6 is an empty ecomon template.** Also superseded.
- The live boards are **2, 3, 5, 8** (hero, hero variant, the content board,
  and the content board in the alternate layout) plus **4**, the booth
  identification activity with the START→FINISH path.

**The real palette, sampled off the export rather than eyeballed:**

| | |
|---|---|
| forest | `#154D30` — the wordmark |
| green | `#3E9A5E` — section pills |
| blue | `#3463B5` — the secondary pill colour |
| mist | `#EBFDEF` — the ground the content cards sit on |

The app has been repainted to this. It had been running on bark/lime/
ultramarine since 09-08, taken from what turned out to be the superseded sheet.

### The problem with that

The working pubmat Katherine sent at 20:36 reads **"eComon"**.

The name poll closed **on the same evening, 21:32** — 56 minutes *after* that pubmat was
posted — and **magisphere won** (Ivan, Sophia, Aleij Jill all voted it; Katherine then
renamed the group `yclap magisphere 🌏🦅`).

The app, the manifest, the deck and the concept note all now say **Magisphere**. The
boards are about to go to a printer saying **eComon**. Print is the one surface that
cannot be re-deployed on Friday night.

**This needs a decision before the PNG goes out, and it is not mine to make.** Either the
boards say Magisphere, or the app reverts to ecomon, or the group knowingly ships both
names and explains it at the booth. All three are survivable; discovering the split on
Saturday is not.

### The other print constraint, easy to miss

> **Shenina (21:24):** "sorry di ko pala nasabi, yung QR code na gamitin is yung **'a' or
> eagle**. https://go.ateneo.edu/QRcode"

The QR on the boards must be generated through the Ateneo generator, in the "a" or eagle
style — not a generic QR. If the boards were already exported with a plain QR, they need
re-exporting.

---

## 1b · The one thing that still needs fixing before print

Both the publication material (boards 5 and 8) and **deck slide 9** describe
the gamified features as:

> "species badges, **points**, challenges, and **leaderboards** inspired by
> location-based exploration games"

**The app has badges. It has no points and no leaderboard.** That is not an
omission — it is a design decision with a test enforcing it: there is no field
in the data model a rank could be built from, and `badge.test.ts` fails any
badge whose name or blurb mentions ranking. The reason is in the group's own
material — personal progression, not public rank, following Ateneo's published
work on meaningful gamification (Rodrigo, Favis & Cuyegkeng 2021, RECIPE),
which the app cites on screen.

A judge who reads the board and then opens the app finds the app does not do
what the board says. Suggested replacement, which is a stronger claim than the
original:

> "…gamified features such as species badges, collections, and challenges
> inspired by location-based exploration games — **personal progression rather
> than public ranking.**"

Refusing a leaderboard on published pedagogy is a decision worth defending in
front of judges. Claiming one you do not have is not.

---

## 2 · AV — the deck's checklist was wrong, now fixed

> **Shenina (09-07):** "Venue on Wednesday, Sept 9, 3:30-6PM is at **NGF Conference Room,
> Horacio dela Costa, 1st floor**. TV is provided, but please **bring your own
> connector/adaptor**."
> **Ivan:** "For the TV, is it for Wednesday or for Saturday?" → **Shenina: "For
> Wednesday"**

**The TV is Wednesday only. Saturday's booth AV is not confirmed by anyone.** Ivan's mini
projector, hub and HDMI (offered 09-08, 21:56) are therefore not a nice-to-have — as of
now they are the *only* known display for the showcase itself. `deck-7-slide.md` has been
corrected to say this.

---

## 3 · What the group already decided about the presentation

> **Ivan (09-05, 10:56):** "take note nalang in doing presentation, ung mas mahalaga is
> **we show the website and its feasability**, kahit wag na mag yap sa iba."

This is the strongest steer anyone has given and it matches the deck's shape: slide 4 is
a sixty-second live demo, and slide 6 is feasibility stated as limits rather than claims.
Worth saying out loud on Wednesday so nobody rebuilds the deck around narration.

Also standing, from 09-05: **7 slides maximum**, plus a **two-page concept note** in
document form (both now exist).

---

## 4 · Registration is nearly empty

> **Shenina (09-08, 18:18):** "invite your friends to attend the YLCAP on Saturday. **So
> far, there's only 4 that applied through the Gform**"

Four registrations, four days out. Link: `https://forms.gle/SjYxevkTDyvEEzar9`.

This matters to us specifically: a booth with no visitors cannot demo a *multiplayer*
world. The sync server's whole point is two phones seeing each other. If attendance stays
low, the walkers-out-now strip should be treated as optional on the day rather than
something the pitch leans on.

---

## 5 · What the CCC has been told about our app

> **Katherine to Jack Lorenz (09-05):** "This is our GDrive of materials […] **The app is
> not yet uploaded as it is still being worked on**, but the slides titled 'ADMU' have
> some screenshots on the final slide"

Drive: `drive.google.com/drive/folders/1NeMf512NMQt12BSGhzIq8R6dgFn3nLKq`

So the organisers currently have screenshots and no app. Once the handset/HTTPS question
is settled (`web-forest/script/handset.md`), a live URL is the single highest-value thing
to hand them, and it will land better than any slide.

Separately, on 09-08 the ADMU slide deck lost access for most of the group — Katherine,
Sophia and Aleij Jill all reported it, and the original appears to have been moved out of
its parent Drive. Ivan re-shared an editable copy at 20:31. **The deck lives in one
account's Drive and nearly vanished four days out**; a copy in the group's own folder is
cheap insurance.

---

## 6 · The other schools — what is actually known

This is thin, and I am not going to pad it. The Session 2 and 3 shared Drive
(`1LUaye1ZaD5fN14N5bcLjLaIsLgp9AaS7`) holds one folder per school. From the screenshot
and the chat:

| School | What is visible | Read |
|---|---|---|
| **PLV** (Pamantasan ng Lungsod ng Valenzuela) | **Project GINHAWA** — a disaster/heat-awareness project sited in **Barangay Canumay West, Valenzuela City**. Named, branded, barangay-specific | The most directly comparable in ambition: a named product with a real site |
| **Mapúa** | Problem tree — **floods / pagbabaha**, with rows on flood infrastructure, post-flood handling and early-warning | Classic Youth CLAP framing, well-structured, no product named in what is visible |
| **PNU** | Problem tree, filipino-language rows | — |
| **PUP** | Problem tree — energy: "higher energy maintenance and defense/deferred campus operations", "campus costs" | Campus-scoped like ours, but on energy rather than biodiversity |
| **QCU** | > **Ivan (09-05):** "Sa quezon city university they created unique ideas din e, **recycling the fabric**" | A materials/circularity project |
| **UP** | > **Ivan:** "UP lang di sinabihan na exciting project nila" — presented in the same group as ours on the Saturday | Unknown content |

### I tried to open their actual files, and could not

The Drive folder from the screenshot (`1LUaye1ZaD5fN14N5bcLjLaIsLgp9AaS7`) is
shared with the account that can see the Session 2 and 3 materials. The Google
Drive connection available to this session authenticates as
**`mudtojan@ateneo.edu`** — the AIPO / IMPACT NXT account, not the one Youth
CLAP shared with. Querying that folder id returns empty, and a `sharedWithMe`
search for GINHAWA / PLV / Mapúa / PNU / PUP returns nothing.

So the table above is read off the screenshot and the chat, and that is as far
as it can honestly go from here. **If you want a real read of the other
schools' work, open the folder on the account it was shared with** and either
export the decks or point me at them; the analysis is twenty minutes once the
files are reachable. Recorded so nobody assumes it was skipped.

### What this means for our positioning — inference, clearly marked

Most of what is visible is **problem trees and proposals**. Ours is the only one I can see
evidence of that is a **working piece of software with a demo you can hand to a judge**.
That is our edge and it should be spent, not hedged: slide 4 exists to put a running app
in someone's hands inside sixty seconds.

The corresponding risk is the mirror image. Everyone else's project is scoped to a
barangay or a city; ours is scoped to **one campus**. A judge weighing reach will notice.
The honest answer is already in the concept note — representative areas first, expand
later, which is exactly what the mentor praised on the 09-08 recording:

> "I also love that even in planning, you take into account the feasibility of it, certain
> areas for representative trees for areas first and then you can expand it later. I think
> it's a really good plan to start the project that was gamified […] so participants can
> interact more and they can really explore the different trees around the campus."
> — mentor video, transcribed from `yclap-magisphere-video-2410fb3e.mp4`

**That recording cuts off at "So there are a few suggestions."** The suggestions
themselves are not in the vault.

I went looking for a longer copy and there is not one. Searched every video and audio
attachment in `~/polkadoc` touched since 2026-09-01, found three recordings longer than
the 39-second clip, and checked all three: two (`62153a90`, `e5ecb017`, 97 s and 149 s)
carry **no audio stream at all** — they are the silent video halves of a DASH pair — and
the one that does (`67622642`, 97 s) transcribes to unrelated Facebook media, not the
consultation. The 39-second clip in the group chat is the whole of what was posted.

Two ways to get the rest, both needing a person:

- **Ask whoever recorded it** for the full file. It is judge-adjacent feedback on this
  exact project and we are pitching on Saturday without it.
- **Re-scrape the group chat.** The vault's last pass ran 2026-09-08 23:13 and the video
  was the final item in it, so anything posted after midnight is simply not here yet. The
  `plaud` MCP server is also failing to start on this machine (`ENOENT … npx`), so the
  refresh has to be run by hand.

---

## What I would do first, in order

1. **Resolve eComon vs Magisphere before the PNG goes to Ms. Shenina this morning.** Print
   is irreversible; everything else is not.
2. Regenerate the board QR through `go.ateneo.edu/QRcode` in the "a"/eagle style.
3. Confirm Saturday's display. If there is no TV, Ivan's projector is the plan and it
   should be tested on Wednesday against the actual deck and the actual phone.
4. Copy the ADMU deck into the group's own Drive.
5. Chase the rest of the mentor recording.
6. Push registrations — four is not a room.
