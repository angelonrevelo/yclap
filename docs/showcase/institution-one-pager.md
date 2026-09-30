# Magisphere: a one-page brief for campus offices

**Walk your campus. Learn what lives on it, where to go when it floods, and how to get help.**

Magisphere is a campus map students open because walking it is a game. For the office that runs it, it's a self-guided program with numbers it can report. Built by a Youth CLAP student team at the Ateneo de Manila. **Alpha.** Nothing here is an official university system.

## What your office gets

| | |
|---|---|
| **A self-guided biodiversity walk** | Species hotspots per sector from the campus's own iNaturalist record, and a tree walk students can do between classes |
| **Help and hazard points** | Clinics, safety and fire points from OpenStreetMap, UP NOAH's 100-year flood model, and a walking route to the nearest help. Labelled **not the official emergency plan** until your DRRM office provides one |
| **Weekly numbers** | Walkers by week and returning walkers on a moderator console. Counted from finds students already share: no new data collected, nobody named |
| **Moderation** | Problem reports, hiding a walker or a find, and an audit log that records which moderator acted |

## What your office provides

- A **named moderator** for the term.
- The **tree inventory** (or species list) you want students to walk.
- A contact at the **DRRM office / CFMO** for the official emergency map.
- Your **Data Protection Officer's** review of the Child Privacy Impact Assessment draft ([`../spec/cpia-draft.md`](../spec/cpia-draft.md)).

## How student data is handled

- **Journals and photos stay on the phone.** Notes never leave it, account backup included.
- **What's shared:** a find's species, place and time, under a display name, or "A walker" for students who hide. Rare species are shared without their location.
- **Live map:** your choice, set per campus. Everyone visible with a hide switch (`shared`); nobody visible until they opt in (`opt_in`); or switched off (`HALL_OFF`).
- **Retention:** shared finds 150 days (one term plus 30 days), reports 30 days, live positions 60 seconds.
- **Breach:** a written runbook with the NPC's 72-hour clock and notice to parents of minors ([`../spec/breach-runbook.md`](../spec/breach-runbook.md)).

## Pilot terms (proposed)

- **One free term** for the first campus, in exchange for the inventory, a moderator and the DRRM contact.
- A **second campus** would be quoted per term. No price is set yet, and none is claimed here.
- Hosting costs about **USD 5 a month** at most (Cloudflare Workers, paid plan); one campus fits the free tier.

## What it is not

- Not an official emergency, evacuation or AIS system.
- Not a game with ads or purchases.
- It doesn't identify species itself. Pl@ntNet or Seek suggests, and the student picks.

*Sources and reasoning: [`../brainstorm/magisphere-institution/blueprint.md`](../brainstorm/magisphere-institution/blueprint.md).*
