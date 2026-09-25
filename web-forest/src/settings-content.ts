/**
 * Everything the Settings surface says, as data.
 *
 * Kept out of the component for one reason: this is the screen that makes
 * claims about the project — what stage it is at, who we work with, what it is
 * for. Claims belong somewhere a reader can check them against the repo, not
 * buried in JSX between style objects. Every office below is one the Working
 * Doc or the 09-21 recording actually names, and every "what we asked them for"
 * is the ask as it was written, not a summary of how it went.
 *
 * The one rule this file follows, and the reason `is_confirmed` exists: a
 * partner we have APPROACHED is not a partner who has AGREED. The Working Doc's
 * own objective one says it out loud — *"Record who answered and who did not.
 * Do not claim '20 representatives consulted' until that number is real."* A
 * settings page that lists eight offices under a heading like "Our partners"
 * makes exactly the claim that objective forbids.
 */

export type Stage = "alpha" | "beta" | "pilot" | "live";

export interface StageRow {
  key: Stage;
  label: string;
  blurb: string;
}

/**
 * Where the product actually is. `alpha` — and the copy says what that means in
 * terms a student can act on, not in terms that flatter us.
 */
export const STAGE_NOW: Stage = "alpha";

export const STAGE_LADDER: StageRow[] = [
  {
    key: "alpha",
    label: "Alpha",
    blurb:
      "Where we are. The walk, the map and the journal work, and everything in them lives on your phone. Species lists are provisional, nothing is reviewed by a person yet, and the app can change under you without warning.",
  },
  {
    key: "beta",
    label: "Beta",
    blurb:
      "A real species list from AIS, a named reviewer for observations, and accounts that survive losing your phone.",
  },
  {
    key: "pilot",
    label: "Pilot",
    blurb:
      "Open to a cohort of students for a semester, with the privacy and consent terms agreed and published first.",
  },
  {
    key: "live",
    label: "Live",
    blurb:
      "Handed to an Ateneo office that owns it, with a yearly biodiversity report coming out of what students logged.",
  },
];

export interface PartnerRow {
  name: string;
  short: string;
  /** What we need from them, in their words where we have them. */
  ask: string;
  /**
   * TRUE only when that office has actually agreed to something.
   *
   * Nothing is true today. That is not modesty — the Working Doc lists the
   * consultations as still to be run, and a page that implies otherwise would
   * be the app lying about its own institutional standing on a screen
   * students read.
   */
  is_confirmed: boolean;
}

export const PARTNER: PartnerRow[] = [
  {
    name: "Ateneo Institute of Sustainability",
    short: "AIS",
    ask: "The campus species list, verified green-coverage figures, and whether tree coordinates exist that students may see.",
    is_confirmed: false,
  },
  {
    name: "Campus Facilities Management Office",
    short: "CFMO",
    ask: "Which ground is walkable and which is off-limits, so the map never sends anybody somewhere they should not be.",
    is_confirmed: false,
  },
  {
    name: "Manila Observatory",
    short: "MO",
    ask: "Urban-heat and land-cover framing, so the climate-resilience copy is sourced rather than asserted.",
    is_confirmed: false,
  },
  {
    name: "The Ateneo Wild",
    short: "TAW",
    ask: "Documented campus biodiversity and landmark-tree histories, and help telling students this exists.",
    is_confirmed: false,
  },
  {
    name: "Office of Student Activities",
    short: "OSA",
    ask: "A route to freshies through OrSem and to organisations through the year.",
    is_confirmed: false,
  },
  {
    name: "Faculty researchers",
    short: "Faculty",
    ask: "Review of the species routing, and existing thesis work we should be building on instead of repeating.",
    is_confirmed: false,
  },
];

/**
 * The essay. Three beats: the problem, what this does about it, and why that
 * is worth anything.
 *
 * Written to be read by a student standing at a booth in under a minute, which
 * is the only length that matters — and sourced, because the numbers in it are
 * the reason to believe the rest.
 */
export interface EssayBeat {
  key: string;
  heading: string;
  body: string;
  /** Shown as a small footnote under the beat. Empty when we are asserting nothing. */
  source?: string;
}

export const ESSAY: EssayBeat[] = [
  {
    key: "problem",
    heading: "Two-thirds of this campus is green, and it is under pressure",
    body:
      "Ateneo Loyola Heights is one of the largest pieces of urban forest left in Metro Manila. It is also getting hotter, drier and more built-on, and the species that cope best with that are not always the ones being planted. Meanwhile Metro Manila as a whole has lost around 40% of its green space per person — so what happens on this campus is not a campus-sized question.",
    source: "Esmena et al. (2025), on urban green space per capita in NCR",
  },
  {
    key: "gap",
    heading: "The problem is not that nobody cares. It is that nobody can name anything",
    body:
      "Students walk under these trees every day and could not tell you one of them apart. You cannot protect what you cannot name, and you cannot argue for a grove in a campus-development meeting if the only thing anybody can say about it is that it is green. Awareness without specifics does not survive contact with a car park proposal.",
  },
  {
    key: "what",
    heading: "So this makes noticing into something you do, not something you are told",
    body:
      "Walk the campus. Species appear near you the way they do in the games you already play. Find the real tree, photograph it, and it goes into a journal that is yours. Do that for a few weeks and two things exist that did not before: a student who can name twenty species, and a record of what is actually growing where — built by the people who walk past it.",
  },
  {
    key: "why",
    heading: "And the record is the point",
    body:
      "Points and streaks are the reason to come back; they are not the output. The output is a body of observations an Ateneo office can use when deciding what to plant, what to protect and what to cut — sourced from students rather than from one survey that ages the day it is filed.",
  },
];

/** Honest limits. On the same screen as the pitch, not a page away. */
export const LIMIT: string[] = [
  "Nothing here is a survey. Species lists are provisional until AIS supplies the real inventory.",
  "No observation has been checked by a person yet. Statuses on your journal are this device's own labels.",
  "Everything is stored on this phone unless you sign in. An optional account copies journal entries and points (never photos) to the project's own server; without one, clearing browser data loses them.",
  "This is a student project for Youth CLAP 2026. It is not an official Ateneo product and does not speak for any office.",
];
