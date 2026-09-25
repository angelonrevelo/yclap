/**
 * iNaturalist suggestion → campus species. Pure; no fetch, no DOM.
 *
 * iNat's computer vision answers in taxa, not in our nine species codes, and
 * it often answers above species ("Vitex", "Fabaceae") when the photo is not
 * decisive. This maps each suggestion onto the curated campus list by taxon id
 * and ancestry, and says HOW it matched:
 *
 *   exact  — the suggestion is the campus taxon, or sits below it (a variety of
 *            it, or any fig for the genus-level Balete row).
 *   genus  — same genus as one or more campus species, but not the species.
 *            Vitex rolls up to BOTH Molave and Lagundi; that is the point of
 *            returning a list instead of guessing.
 *   family — same family only. A hint, never an identification.
 *
 * Anything that is not `exact` is flagged `is_partial`, and the UI must not
 * pre-fill a student's pick from a partial match.
 *
 * Taxon ids were read from https://api.inaturalist.org/v1/taxa on 2026-09-25.
 */

export type MatchKind = "exact" | "genus" | "family";

export interface CampusTaxon {
  species_code: string;
  scientific_name: string;
  /** The iNat taxon this campus row is. Genus-level for Balete ("Ficus sp."). */
  taxon_id: number;
  taxon_rank: "species" | "genus";
  genus_id: number;
  genus_name: string;
  family_id: number;
  family_name: string;
}

export const campus_taxon: CampusTaxon[] = [
  { species_code: "narra", scientific_name: "Pterocarpus indicus", taxon_id: 348101, taxon_rank: "species", genus_id: 68662, genus_name: "Pterocarpus", family_id: 47122, family_name: "Fabaceae" },
  { species_code: "molave", scientific_name: "Vitex parviflora", taxon_id: 170274, taxon_rank: "species", genus_id: 126846, genus_name: "Vitex", family_id: 48623, family_name: "Lamiaceae" },
  { species_code: "katmon", scientific_name: "Dillenia philippinensis", taxon_id: 191498, taxon_rank: "species", genus_id: 183748, genus_name: "Dillenia", family_id: 71499, family_name: "Dilleniaceae" },
  { species_code: "dao", scientific_name: "Dracontomelon dao", taxon_id: 427556, taxon_rank: "species", genus_id: 183663, genus_name: "Dracontomelon", family_id: 48874, family_name: "Anacardiaceae" },
  { species_code: "mahogany", scientific_name: "Swietenia macrophylla", taxon_id: 169442, taxon_rank: "species", genus_id: 155941, genus_name: "Swietenia", family_id: 53724, family_name: "Meliaceae" },
  { species_code: "raintree", scientific_name: "Samanea saman", taxon_id: 281371, taxon_rank: "species", genus_id: 138599, genus_name: "Samanea", family_id: 47122, family_name: "Fabaceae" },
  { species_code: "teak", scientific_name: "Tectona grandis", taxon_id: 62887, taxon_rank: "species", genus_id: 62892, genus_name: "Tectona", family_id: 48623, family_name: "Lamiaceae" },
  { species_code: "balete", scientific_name: "Ficus sp.", taxon_id: 50999, taxon_rank: "genus", genus_id: 50999, genus_name: "Ficus", family_id: 50998, family_name: "Moraceae" },
  { species_code: "lagundi", scientific_name: "Vitex negundo", taxon_id: 170273, taxon_rank: "species", genus_id: 126846, genus_name: "Vitex", family_id: 48623, family_name: "Lamiaceae" },
];

/** The part of an iNat suggestion the match needs. */
export interface MatchInput {
  taxon_id: number | null;
  ancestor_ids: number[];
  scientific_name: string;
}

export interface CampusMatch {
  match_kind: MatchKind;
  /** Every campus species this suggestion could be. One entry when exact. */
  species_code: string[];
  is_partial: boolean;
  /** The taxon the match was made on: the species, or the genus/family rolled up to. */
  matched_name: string;
  /** True when iNat sent no ancestry and the match fell back to the name. */
  is_by_name: boolean;
}

function lineage(input: MatchInput): Set<number> {
  const id = new Set(input.ancestor_ids);
  if (input.taxon_id !== null) id.add(input.taxon_id);
  return id;
}

function codeOf(row: CampusTaxon[]): string[] {
  return row.map((r) => r.species_code);
}

function byAncestry(input: MatchInput): CampusMatch | null {
  const id = lineage(input);
  if (id.size === 0) return null;
  const exact = campus_taxon.filter((c) => id.has(c.taxon_id));
  if (exact.length) {
    return { match_kind: "exact", species_code: codeOf(exact), is_partial: false, matched_name: exact[0]!.scientific_name, is_by_name: false };
  }
  const genus = campus_taxon.filter((c) => id.has(c.genus_id));
  if (genus.length) {
    return { match_kind: "genus", species_code: codeOf(genus), is_partial: true, matched_name: genus[0]!.genus_name, is_by_name: false };
  }
  const family = campus_taxon.filter((c) => id.has(c.family_id));
  if (family.length) {
    return { match_kind: "family", species_code: codeOf(family), is_partial: true, matched_name: family[0]!.family_name, is_by_name: false };
  }
  return null;
}

/**
 * Fallback for a response that carries no ancestry: exact scientific name, then
 * genus by the first word. No family step — a family cannot be read off a name.
 */
function byName(input: MatchInput): CampusMatch | null {
  const name = input.scientific_name.trim().toLowerCase();
  if (!name) return null;
  const word = name.split(/\s+/);
  const exact = campus_taxon.filter((c) =>
    c.taxon_rank === "genus"
      ? word[0] === c.genus_name.toLowerCase()
      : name === c.scientific_name.toLowerCase() || name.startsWith(c.scientific_name.toLowerCase() + " "),
  );
  if (exact.length) {
    return { match_kind: "exact", species_code: codeOf(exact), is_partial: false, matched_name: exact[0]!.scientific_name, is_by_name: true };
  }
  const genus = campus_taxon.filter((c) => word[0] === c.genus_name.toLowerCase());
  if (genus.length) {
    return { match_kind: "genus", species_code: codeOf(genus), is_partial: true, matched_name: genus[0]!.genus_name, is_by_name: true };
  }
  return null;
}

/** One suggestion → the campus species it lands on, or null when it lands on none. */
export function matchCampus(input: MatchInput): CampusMatch | null {
  if (input.ancestor_ids.length || input.taxon_id !== null) {
    const hit = byAncestry(input);
    /* A bare taxon id with no ancestry can only prove an exact hit; anything
       else deserves the name fallback before giving up. */
    if (hit || input.ancestor_ids.length) return hit;
  }
  return byName(input);
}

export interface RankedMatch {
  /** 1-based position of the suggestion in iNat's list. */
  position: number;
  match: CampusMatch;
}

/**
 * The best campus reading of a whole suggestion list: the first EXACT match in
 * iNat's order, else the first partial one. Returns null when nothing in the
 * list touches the campus list.
 */
export function bestCampusMatch(suggestion: MatchInput[]): RankedMatch | null {
  let partial: RankedMatch | null = null;
  for (let i = 0; i < suggestion.length; i += 1) {
    const match = matchCampus(suggestion[i]!);
    if (!match) continue;
    if (!match.is_partial) return { position: i + 1, match };
    partial ??= { position: i + 1, match };
  }
  return partial;
}

/**
 * The smoke suite's scoring rule, kept here so the app and the suite cannot
 * drift: 1-based position of the first EXACT match for `species_code` within
 * the first `within` suggestions, or null.
 */
export function exactPosition(suggestion: MatchInput[], species_code: string, within = 5): number | null {
  for (let i = 0; i < Math.min(within, suggestion.length); i += 1) {
    const match = matchCampus(suggestion[i]!);
    if (match && !match.is_partial && match.species_code.includes(species_code)) return i + 1;
  }
  return null;
}

/**
 * The campus species an identification should pick for the student, or null.
 *
 * The daily hunt opens the log sheet with its own target already chosen, so a
 * photo of a Narra used to leave the pick on the hunt's species and Save logged
 * the wrong tree. Now the first EXACT, single-species match in iNat's list is
 * selected — visibly, with "suggested by iNaturalist" beside it — unless the
 * student has already chosen by hand since taking the photo. A genus or family
 * roll-up never picks: "Vitex" could be Molave or Lagundi.
 *
 * The recorded (demo) reply picks too, because the booth runs on it; the sheet
 * still says it is a recorded reply and not a read of this photo.
 */
export function suggestedPick(
  state: { status: string; suggestion?: MatchInput[] },
  is_manual: boolean,
): string | null {
  if (is_manual) return null;
  if (state.status !== "ready" && state.status !== "demo") return null;
  const best = bestCampusMatch(state.suggestion ?? []);
  if (!best || best.match.is_partial || best.match.species_code.length !== 1) return null;
  return best.match.species_code[0]!;
}
