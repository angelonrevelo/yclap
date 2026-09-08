import type { LatLon } from "./geo.ts";

export type Origin = "Native" | "Exotic";

export interface Species {
  species_code: string;
  common_name: string;
  scientific_name: string;
  origin: Origin;
  pill: string[];
  note: string;
  caption: string | null;
  tile_note: string | null;
}

/** Curated starter list — do not invent a 1,809-row table. */
export const species: Record<string, Species> = {
  narra: {
    species_code: "narra",
    common_name: "Narra",
    scientific_name: "Pterocarpus indicus",
    origin: "Native",
    pill: ["Native", "National tree", "Shade"],
    note: "A long-lived native. Urban-canopy models for Metro Manila show land cover changes the heat you feel — this is shade, not a slogan.",
    caption:
      "Heat context: Bilang et al. 2022 / Llorin, Villarin et al. 2024 (Archīum Physics + Manila Observatory). Not a campus thermometer.",
    tile_note: null,
  },
  molave: {
    species_code: "molave",
    common_name: "Molave",
    scientific_name: "Vitex parviflora",
    origin: "Native",
    pill: ["Native", "Threatened", "Hardwood"],
    note: "Hard timber, slow to grow, and now threatened — the kind of tree a campus should protect on purpose. Not the same plant as Lagundi.",
    caption: null,
    tile_note: null,
  },
  katmon: {
    species_code: "katmon",
    common_name: "Katmon",
    scientific_name: "Dillenia philippinensis",
    origin: "Native",
    pill: ["Native", "Endemic", "Understory"],
    note: "Endemic to the Philippines, edible sour fruit — an understory tree that keeps the ground alive.",
    caption: "Campus samples barcoded — Fatallo 2022. Also Mindoro. Not an inventory.",
    tile_note: "Campus samples barcoded — Fatallo 2022. Also Mindoro. Not an inventory.",
  },
  dao: {
    species_code: "dao",
    common_name: "Dao",
    scientific_name: "Dracontomelon dao",
    origin: "Native",
    pill: ["Native", "Canopy"],
    note: "A big native canopy tree — good shade without crowding out what grows beneath it.",
    caption: null,
    tile_note: null,
  },
  mahogany: {
    species_code: "mahogany",
    common_name: "Mahogany",
    scientific_name: "Swietenia macrophylla",
    origin: "Exotic",
    pill: ["Exotic", "Fast shade"],
    note: "Fast shade. Natives often fail underneath plantation canopies — analog Ortiz et al. 2024 (Chile pines/eucalypts, Manila Observatory), not an Ateneo mahogany survey. PH reforestation already fails when soil and native vs exotic are ignored (Navarrete et al. 2018).",
    caption: "Analog: Chilean plantation landscapes (Ortiz et al. 2024, MO), not an Ateneo survey.",
    tile_note:
      "Fast shade. Natives often fail underneath plantation canopies — analog Ortiz et al. 2024 (Chile pines/eucalypts, Manila Observatory), not an Ateneo mahogany survey. PH reforestation already fails when soil and native vs exotic are ignored (Navarrete et al. 2018).",
  },
  raintree: {
    species_code: "raintree",
    common_name: "Rain tree",
    scientific_name: "Samanea saman",
    origin: "Exotic",
    pill: ["Exotic", "Wide shade"],
    note: "Wide, low shade — common on the quads, but not from here.",
    caption: null,
    tile_note: null,
  },
  teak: {
    species_code: "teak",
    common_name: "Teak",
    scientific_name: "Tectona grandis",
    origin: "Exotic",
    pill: ["Exotic", "Timber"],
    note: "Planted for timber; big leaves, but exotic to Philippine forest.",
    caption: null,
    tile_note: null,
  },
  balete: {
    species_code: "balete",
    common_name: "Balete",
    scientific_name: "Ficus sp.",
    origin: "Native",
    pill: ["Native", "Strangler fig", "Landmark"],
    note: "A strangler fig — the landmark trees people navigate by without knowing the name.",
    caption: null,
    tile_note: null,
  },
  lagundi: {
    species_code: "lagundi",
    common_name: "Lagundi",
    scientific_name: "Vitex negundo",
    origin: "Native",
    pill: ["Native", "Shrub", "Medicinal"],
    note: "A medicinal shrub, not a canopy tree. Documented from Loyola Heights accessions — never the same card as Molave (Vitex parviflora).",
    caption: "Ledesma 2022 · campus accessions. Shrub, not canopy.",
    tile_note: "Shrub · Ledesma 2022 · Loyola Heights accessions.",
  },
};

/* ── what a species is actually like ───────────────────────────────────────
 *
 * The cards shipped pills and a prose note, which is not enough to answer
 * "what am I looking at" and too much to read at a glance. These are the
 * attribute tiles and the habitat line.
 *
 * Every value here is a restatement of something already in the record above —
 * its origin, its pill set, its note — or of a citation already in this file.
 * Nothing was looked up to build this block, and nothing here is a campus
 * measurement. Where the only warrant is our own curation, the source says so
 * in those words rather than borrowing a paper's authority.
 */

export const CURATED_SOURCE = "Curated field-guide list — not a campus survey";

export interface SpeciesAttribute {
  label: string;
  value: string;
  /** Why we can say it. Either a citation already in this file, or CURATED_SOURCE. */
  source: string;
}

export interface SpeciesHabitat {
  line: string;
  source: string;
}

/**
 * A documented look-alike. Rendered ABOVE the species name, because a warning
 * under the fold is a warning nobody read. The pair stays two separate
 * records — merging Lagundi into Molave is a standing rejection.
 */
export interface Confusable {
  species_code: string;
  difference: string;
  source: string;
}

export interface SpeciesDetail {
  attribute: SpeciesAttribute[];
  habitat: SpeciesHabitat;
  confusable: Confusable | null;
}

const detail: Record<string, SpeciesDetail> = {
  narra: {
    attribute: [
      { label: "Origin", value: "Native", source: CURATED_SOURCE },
      { label: "In the canopy", value: "Shade tree", source: CURATED_SOURCE },
      { label: "Standing", value: "National tree", source: CURATED_SOURCE },
    ],
    habitat: {
      line: "Long-lived, planted for shade; urban land cover is what changes the heat you feel underneath it.",
      source: "Bilang et al. 2022 / Llorin, Villarin et al. 2024 (Archīum Physics + Manila Observatory)",
    },
    confusable: null,
  },
  molave: {
    attribute: [
      { label: "Origin", value: "Native", source: CURATED_SOURCE },
      { label: "In the canopy", value: "Hardwood", source: CURATED_SOURCE },
      { label: "Standing", value: "Threatened", source: CURATED_SOURCE },
    ],
    habitat: {
      line: "Hard timber, slow to grow — the kind of tree a campus should protect on purpose.",
      source: CURATED_SOURCE,
    },
    confusable: {
      species_code: "lagundi",
      difference:
        "Lagundi (Vitex negundo) is the same genus but a medicinal shrub, not a canopy hardwood. Same Vitex, different plant.",
      source: CURATED_SOURCE,
    },
  },
  katmon: {
    attribute: [
      { label: "Origin", value: "Native", source: CURATED_SOURCE },
      { label: "In the canopy", value: "Understory", source: CURATED_SOURCE },
      { label: "Standing", value: "Endemic", source: CURATED_SOURCE },
    ],
    habitat: {
      line: "An understory tree with edible sour fruit; campus samples were barcoded, and so were Mindoro ones.",
      source: "Fatallo 2022 — campus samples barcoded. Also Mindoro. Not an inventory.",
    },
    confusable: null,
  },
  dao: {
    attribute: [
      { label: "Origin", value: "Native", source: CURATED_SOURCE },
      { label: "In the canopy", value: "Canopy", source: CURATED_SOURCE },
      { label: "Standing", value: "Shade without crowding", source: CURATED_SOURCE },
    ],
    habitat: {
      line: "A big native canopy tree that shades the ground without closing it off to what grows beneath.",
      source: CURATED_SOURCE,
    },
    confusable: null,
  },
  mahogany: {
    attribute: [
      { label: "Origin", value: "Exotic", source: CURATED_SOURCE },
      { label: "In the canopy", value: "Fast shade", source: CURATED_SOURCE },
      { label: "Standing", value: "Plantation timber", source: CURATED_SOURCE },
    ],
    habitat: {
      line: "Natives often fail underneath plantation canopies — read as an analog, never as an Ateneo mahogany survey.",
      source: "Ortiz et al. 2024 (Chile pines/eucalypts, Manila Observatory); Navarrete et al. 2018",
    },
    confusable: null,
  },
  raintree: {
    attribute: [
      { label: "Origin", value: "Exotic", source: CURATED_SOURCE },
      { label: "In the canopy", value: "Wide, low shade", source: CURATED_SOURCE },
      { label: "Standing", value: "Common on the quads", source: CURATED_SOURCE },
    ],
    habitat: {
      line: "Wide, low shade — common on the quads, but not from here.",
      source: CURATED_SOURCE,
    },
    confusable: null,
  },
  teak: {
    attribute: [
      { label: "Origin", value: "Exotic", source: CURATED_SOURCE },
      { label: "In the canopy", value: "Big-leaved timber", source: CURATED_SOURCE },
      { label: "Standing", value: "Planted, not wild here", source: CURATED_SOURCE },
    ],
    habitat: {
      line: "Planted for timber; big leaves, but exotic to Philippine forest.",
      source: CURATED_SOURCE,
    },
    confusable: null,
  },
  balete: {
    attribute: [
      { label: "Origin", value: "Native", source: CURATED_SOURCE },
      { label: "In the canopy", value: "Strangler fig", source: CURATED_SOURCE },
      { label: "Standing", value: "Landmark", source: CURATED_SOURCE },
    ],
    habitat: {
      line: "A strangler fig — one of the landmark trees people navigate by without knowing the name.",
      source: CURATED_SOURCE,
    },
    confusable: null,
  },
  lagundi: {
    attribute: [
      { label: "Origin", value: "Native", source: CURATED_SOURCE },
      { label: "In the canopy", value: "Shrub, not canopy", source: "Ledesma 2022 · campus accessions" },
      { label: "Standing", value: "Medicinal", source: CURATED_SOURCE },
    ],
    habitat: {
      line: "A medicinal shrub rather than a canopy tree, documented from Loyola Heights accessions.",
      source: "Ledesma 2022 · campus accessions",
    },
    confusable: {
      species_code: "molave",
      difference:
        "Molave (Vitex parviflora) is the same genus but a threatened canopy hardwood, not a shrub. Same Vitex, different plant.",
      source: CURATED_SOURCE,
    },
  },
};

/** Detail for a curated species. null for anything off the starter list. */
export function speciesDetail(species_code: string): SpeciesDetail | null {
  return detail[species_code] ?? null;
}

export interface EncounterSeed {
  encounter_id: string;
  species_code: string;
  /**
   * Explicit lat/lon since T1.1. These were seeded as x/y percents over the
   * old, smaller CAMPUS_BOX and cut to coordinates the day the box grew, so
   * extending the frame again must not drag a tree across campus. The old
   * percent is kept as provenance, nothing more.
   */
  lat: number;
  lon: number;
  where: string;
}

export type Encounter = EncounterSeed;
/* An encounter coordinate is a position on THIS demo map, not a surveyed tree
   location — the type alias keeps that sentence attached to the name. */

/** Walkable-path discs only. None sit inside the SOM / swamp hatch. */
const encounter_seed: EncounterSeed[] = [
  { encounter_id: "e1", species_code: "narra", lat: 14.63905, lon: 121.07712, where: "Gonzaga walk" }, // was 39%, 46%
  { encounter_id: "e2", species_code: "raintree", lat: 14.640025, lon: 121.07864, where: "CTC quad" }, // was 58%, 33%
  { encounter_id: "e3", species_code: "molave", lat: 14.63785, lon: 121.07616, where: "Rizal Library lawn" }, // was 27%, 62%
  { encounter_id: "e4", species_code: "balete", lat: 14.638375, lon: 121.0796, where: "Bellarmine field edge" }, // was 70%, 55%
  { encounter_id: "e5", species_code: "katmon", lat: 14.63725, lon: 121.07792, where: "Xavier walk" }, // was 49%, 70%
  { encounter_id: "e6", species_code: "mahogany", lat: 14.6395, lon: 121.08024, where: "Katipunan gate yard" }, // was 78%, 40%
  { encounter_id: "e7", species_code: "dao", lat: 14.64025, lon: 121.07664, where: "Berchmans lawn" }, // was 33%, 30%
  { encounter_id: "e8", species_code: "lagundi", lat: 14.63695, lon: 121.07576, where: "Bellarmine path" }, // was 22%, 74%
];

export const encounter: Encounter[] = encounter_seed;

/**
 * The off-limits grove — a PLACEHOLDER extent, and it must keep saying so.
 *
 * On the old hand-drawn base this polygon was harmless decoration. On real
 * satellite imagery a hatched boundary is a claim about a real place, and the
 * percentages it was carried over from put it squarely on top of houses
 * north-east of the campus. That is the kind of quiet wrongness this repo is
 * supposed to refuse.
 *
 * These vertices sit on the wooded block inside the campus, so the shape is at
 * least over trees rather than over somebody's roof. It is still NOT surveyed:
 * nobody has given us the SOM grove's boundary. The map caption says
 * "placeholder extent, not surveyed" for that reason, and it stays until CFMO,
 * AIS or the SOM department hand over the real one.
 */
export const RESTRICTED_POLYGON: LatLon[] = [
  { lat: 14.6403, lon: 121.0769 },
  { lat: 14.6404, lon: 121.078 },
  { lat: 14.6397, lon: 121.0783 },
  { lat: 14.6393, lon: 121.0776 },
  { lat: 14.6396, lon: 121.0769 },
];

/**
 * Metres. Inside this the walk treats an encounter as reached — sized for a
 * phone fix (±5–15 m typical) over real imagery, not for survey precision.
 */
export const ENCOUNTER_RADIUS_M = 25;

/** Inside this, the card stops hedging and says you are at the tree. */
export const AT_TREE_RADIUS_M = 8;

/** 9 named + 3 unnamed empty slots = 12 of a starter list. */
export const journal_order: string[] = [
  "narra",
  "molave",
  "katmon",
  "mahogany",
  "lagundi",
  "dao",
  "raintree",
  "teak",
  "balete",
  "slot-a",
  "slot-b",
  "slot-c",
];

export const picker_order: string[] = [
  "narra",
  "molave",
  "katmon",
  "dao",
  "mahogany",
  "raintree",
  "teak",
  "balete",
  "lagundi",
];

export interface Consult {
  consult_id: string;
  label: string;
  detail: string | null;
  /**
   * Who on the team owns reaching out, from the 09-03 announcement.
   *
   * Named here rather than in a chat message because an owner nobody can see is
   * an owner nobody has. It is a task assignment, NOT evidence that the meeting
   * happened — every row still reads "not yet" until it actually does.
   */
  owner: string | null;
}

export const consult: Consult[] = [
  {
    consult_id: "ais",
    label: "Ateneo Institute of Sustainability (AIS) — tree inventory access",
    detail:
      "Cuyegkeng & Favis 2019 already described how this campus struggles to get admin buy-in for sustainability programs. " +
      "Cathy's note stands: AIS has the species list, and the missing data is count and location.",
    owner: "Clariz",
  },
  {
    consult_id: "mo",
    label: "Manila Observatory",
    detail: "Villarin is a coauthor on the Metro Manila UHI / LULC papers.",
    owner: "Charisse · Clariz",
  },
  {
    consult_id: "cfmo",
    label: "CFMO / TAW — grounds",
    detail: null,
    owner: "Ivan",
  },
  {
    consult_id: "wild",
    label: "Student orgs already walking (Ateneo Wild / AGILA)",
    detail: "Ateneo Wild keeps an Instagram catalogue of campus birds and trees; a prof handles the account.",
    owner: "Sophie",
  },
  {
    consult_id: "admunav",
    label: "ADMUNAV authors (Lagyo, Galicia, Guico 2025) — walkable-path graph, if they will share it",
    detail: null,
    owner: null,
  },
];

export const DEMO_PIN = { lat: 14.6386, lon: 121.0785 };

export const SEEK_URL = "https://www.inaturalist.org/pages/seek_app";

export interface Landmark {
  landmark_id: string;
  title: string;
  species_code: string;
  where: string;
  documented: string;
  /** What we have NOT collected. Never fill this with an invented memory. */
  open_ask: string;
  is_oral_history_collected: boolean;
}

/**
 * Camille (2026-08-29, 2:17:00) asked for stories and old photos from older
 * batches. We have not held that interview, so this card states the documented
 * part and names the gap. Do not write a remembered scene here.
 */
export const landmark: Landmark[] = [
  {
    landmark_id: "balete-bellarmine",
    title: "The tree everyone navigates by",
    species_code: "balete",
    where: "Bellarmine field edge",
    documented:
      "A strangler fig (Ficus sp.) — the growth form that begins on another tree and outlives it. Campus balete are the landmarks students give directions with, usually without knowing the name.",
    open_ask:
      "The oral history is not collected yet. We are asking older batches and Ateneo Wild for dated photos and first-hand memories; until someone tells it to us, this card stays a description, not a story.",
    is_oral_history_collected: false,
  },
];

/** Said out loud wherever an AIS figure appears. Cathy, 2026-08-29 (2:12:12). */
/**
 * What we can honestly say about AIS's data — which is less than we were saying.
 *
 * Two sources disagree, and the app was printing both in the same flow:
 *   - R14 records AIS as having **geo-tagged 1,809 trees** (SY 2025–2026),
 *     sourced to AIS campus communications with no retrievable link.
 *   - Cathy, at the 08-29 pitch (`2:12:12`), said AIS has the species database
 *     and is **missing the count and the location** of each tree.
 *
 * Both cannot be true. If they geo-tagged 1,809 trees they have count and
 * location; if they lack count and location they did not geo-tag that many. Our
 * own notes flagged this twice and it got built into the product anyway.
 *
 * Until Clariz's AIS conversation settles it, this states the open question
 * rather than picking whichever answer flatters the project.
 */
export const AIS_GAP_NOTE =
  "AIS keeps a species database for the campus. Whether it also holds a count and a location for every tree is exactly what we are asking them — if that point file exists we surface it, and if it does not, a walk like this is one way to start one.";

/**
 * When the AIS species-per-sector inventory was expected.
 *
 * Four user-visible strings used to hard-code "due 09-09". That date is now
 * today, and on Saturday the app would have been telling judges an inventory
 * was still forthcoming three days after it was expected — which is either
 * stale or a quiet overclaim, and this app's whole posture is that it does not
 * make either.
 *
 * So the phrasing is derived instead of written. Before the date it reads as a
 * date we are waiting on; after it, it says plainly that it has not arrived.
 * It corrects itself on stage without anybody remembering to.
 */
export const AIS_DUE_ISO = "2026-09-09";

/** "due 09-09" before that date; "expected 09-09, not yet received" after it. */
export function aisDueNote(now: Date = new Date()): string {
  const due = new Date(`${AIS_DUE_ISO}T23:59:59+08:00`);
  const short = "09-09";
  return now.getTime() <= due.getTime()
    ? `due ${short}`
    : `expected ${short}, not yet received`;
}

export const WILD_NOTE =
  "Ateneo Wild keeps an Instagram catalogue of campus birds and trees, run by a faculty member. Not consulted yet.";
