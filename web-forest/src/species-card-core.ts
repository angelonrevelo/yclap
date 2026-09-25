/**
 * The pure half of the 3D species card (`species-card.tsx`).
 *
 * Three decisions live here so they can be tested without a DOM:
 *   1. which .glb a species code points at — read off the manifest row, never
 *      guessed from a name, so a species the pack does not cover gets `null`
 *      rather than a 404 dressed up as a model;
 *   2. what the card shows instead when the model cannot be shown — and the
 *      honest line that says why (the species pack is NOT precached by the
 *      service worker, so offline the answer is "3D needs a connection");
 *   3. the Learn subject key, which is the SAME key the existing Learn sheet
 *      awards under, so opening the card after the sheet (or twice) pays +10
 *      exactly once — `awardPoints` dedups on kind + subject.
 */
import type { Species } from "./data.ts";
import { KIND_LABEL, displayName, kindOf, type Kind } from "./kind.ts";
import { RARITY_LABEL, rarityFor, type Rarity, type SpawnPoolEntry } from "./spawn.ts";

/** Manifest `file` values look like `species/narra.glb`. Anything else is refused. */
const MODEL_FILE = /^species\/[a-z0-9][a-z0-9-]*\.glb$/;

/**
 * Site path of a species' model, or null when the pack has no model for it.
 *
 * `file` is the manifest row's own field. When the pool has not loaded yet, a
 * curated species may still resolve: the species-model test guarantees every
 * curated `data.ts` code has a row whose file is `species/<code>.glb`.
 */
export function speciesModelPath(
  species_code: string,
  file: string | null | undefined,
  is_curated: boolean,
): string | null {
  if (file) return MODEL_FILE.test(file) ? `/model/${file}` : null;
  if (is_curated && /^[a-z0-9][a-z0-9-]*$/.test(species_code)) return `/model/species/${species_code}.glb`;
  return null;
}

export type ModelState = "loading" | "loaded" | "error";

/** What the hero of the card is: the turntable, or the flat stand-in. */
export type CardVisual = "model" | "portrait";

export interface VisualChoice {
  visual: CardVisual;
  /** The line under the hero saying why there is no 3D, or null when there is. */
  note: string | null;
}

/**
 * Model when it can be shown; the portrait (photo → drawing → kind mark, which
 * `SpeciesPortrait` already resolves) when it cannot.
 *
 * A model that already loaded stays up if the connection drops — the bytes
 * are in memory. One that has not, offline, is not attempted: the species
 * pack is on-demand, so a spinner that never ends would be a lie.
 */
export function chooseVisual(input: {
  model_path: string | null;
  is_online: boolean;
  model_state: ModelState;
}): VisualChoice {
  if (!input.model_path) return { visual: "portrait", note: "No 3D model for this one yet." };
  if (input.model_state === "loaded") return { visual: "model", note: null };
  if (!input.is_online) return { visual: "portrait", note: "3D needs a connection." };
  if (input.model_state === "error") return { visual: "portrait", note: "The 3D model didn't load." };
  return { visual: "model", note: null };
}

/** The Learn award's subject — identical to the Learn sheet's, on purpose. */
export function learnSubject(species_code: string): string {
  return `species:${species_code}`;
}

export interface CardFact {
  species_code: string;
  common_name: string;
  scientific_name: string;
  kind: Kind;
  kind_label: string;
  /** Band from the real campus observation count; null when unrecorded. */
  rarity: Rarity | null;
  rarity_label: string | null;
  campus_count: number | null;
  origin: string | null;
  model_path: string | null;
  is_curated: boolean;
}

/**
 * Everything the card states about a species, from the two sources the app
 * has: the curated guide (`data.ts`) and the campus sweep (the spawn pool).
 * Curated names win where both exist — they are the ones the guide prints.
 */
export function cardFact(
  species_code: string,
  curated: Species | undefined,
  entry: SpawnPoolEntry | undefined,
): CardFact {
  const kind = entry ? kindOf(entry.iconic_taxon_name, entry.archetype) : kindOf("Plantae", "tree");
  const campus_count = entry?.count ?? null;
  const rarity = rarityFor(campus_count);
  return {
    species_code,
    common_name: curated?.common_name ?? (entry ? displayName(entry.common_name) : species_code),
    scientific_name: curated?.scientific_name ?? entry?.scientific_name ?? "",
    kind,
    kind_label: KIND_LABEL[kind],
    rarity,
    rarity_label: rarity ? RARITY_LABEL[rarity] : null,
    campus_count,
    origin: curated?.origin ?? (entry && entry.origin !== "Unknown" ? entry.origin : null),
    model_path: speciesModelPath(species_code, entry?.file, Boolean(curated)),
    is_curated: Boolean(curated),
  };
}
