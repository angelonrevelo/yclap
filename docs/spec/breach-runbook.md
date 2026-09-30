# Magisphere — personal-data breach runbook

For the pilot team. A breach is any unauthorised access to, or loss or disclosure of, personal data Magisphere holds. The list of what that is lives in [`cpia-draft.md`](cpia-draft.md) §1.

**The clock:** the NPC must be notified **within 72 hours** of knowing, or reasonably believing, that a breach happened (NPC Circular 16-03, enforced in [NPC BN 23-082](https://privacy.gov.ph/wp-content/uploads/2024/12/NPC-BN-23-082-07.04.2023_In-re-DOST-Regional-Office-V_Order.pdf)). The affected people must be told too (RA 10173 §20(f), [text](https://privacy.gov.ph/data-privacy-act/)). **When children are affected, notify both the children and their parents or guardians** ([NPC FAQ, Q19](https://privacy.gov.ph/wp-content/uploads/2024/12/FAQs-Advisory-on-Guidelines-on-Child-Oriented-Transparency.pdf)).

## Roles (fill before the pilot)

| Role | Who | Reach |
|------|-----|-------|
| Incident lead: runs this list | | |
| DPO: decides on notice, files with the NPC | the controller's DPO (see the CPIA's controller question) | |
| Developer of record: contains and investigates | Gelo | |
| Program owner: tells students and parents | the university office | |

## Hour 0–4: contain

1. **Stop live positions:** `npx wrangler secret put HALL_OFF` with the value `1` (LAN box: restart with `HALL_OFF=1`). `/live/socket`, `/live/pose` and `/live/walker` then answer 503 `hall_off`, and phones show no hall. Then **stop new writes:** `WRITE_OFF=1` the same way. `/sync`, sign-up, Google sign-in and account saves answer 503 `write_off`, while reads and problem reports keep working.
2. **Rotate every secret:**
   - `MOD_TOKEN` (every `name:token`);
   - `PLANTNET_API_KEY`;
   - `INAT_API_TOKEN`, if set;
   - the Google OAuth client secret, if set.

   Revoke all sessions: delete the `session` table's rows.
3. **Keep evidence:** export the Durable Object's storage and the `mod_audit` rows before changing anything else. `mod_audit` refuses edits, so it is itself evidence.
4. Start a log: time found, who found it, what is known. Every later step adds a line.

## Hour 4–48: assess

- **What was exposed?** Which rows from the CPIA table: display names, shared finds, accounts, account backups (notes and positions), reports.
- **Whose?** Count people, and whether any are under 18. The app asks no age, so ask the program owner whether the cohort includes minors.
- **Real risk of serious harm?** Live positions, notes and exact journal positions of minors should be assumed to carry it.

## By hour 72: notify

- **The NPC**, by the DPO, in the form NPC Circular 16-03 §18 prescribes.
- **Each affected student**, and **their parents or guardians if they are under 18**, through the program owner. Say what happened, what was exposed, what was done, and whom to contact.
- **The university's CODI**, if the breach enabled harassment or stalking (RA 11313).

## After

- Re-open the hall only after the DPO agrees.
- Write a dated entry in `ROADMAP.md` with what failed, the fix, and the test that now guards it.
- Review this runbook.

**A drill before the pilot:** walk through hours 0–4 on a copy of the Worker, and time it.
