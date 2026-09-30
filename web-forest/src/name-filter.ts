/**
 * The display-name filter — what may be printed over a walker's head on every
 * phone in the hall, and after "… logged Molave" in the live feed.
 *
 * Applied SERVER-side wherever a name enters the shared world: a hall pose
 * (`sanitizePose`), a /sync player (`sanitizePlayer`), an account's display
 * name (signup, Google). A client check would only stop the honest. A refused
 * name falls back to the generated walker name for the same seed — the one
 * this phone was minted with (`sync.ts` mints it through `generatedNameOf`) —
 * so the room still sees a stable, friendly name, and the phone is told why.
 *
 * ## How it matches, and why not a substring scan
 *
 * A plain `includes("puta")` blocks Putatan (a Muntinlupa barangay), `tanga`
 * blocks Batangas, `ass` blocks Assumption, `titi` blocks petite. On a campus
 * of Filipino names and place names that is the wrong way round: the filter's
 * false positives would land on real students. So every entry says how it may
 * match:
 *
 * - `exact`  — a whole word only: puta, gago, tanga, bobo, ulol, ass.
 * - `prefix` — a word that starts with it: fuck(er), bitch(es), kantot(an).
 * - `inside` — anywhere, even across the spaces of the whole name. Only for
 *   stems no ordinary word contains: fuck, tangina, putangina, nigger, faggot.
 *
 * Evasions it normalises first, in this order: Unicode compatibility forms
 * (ｆｕｃｋ), accents (fück), zero-width joiners, Cyrillic look-alikes (fuсk),
 * leetspeak (sh1t, p0ta, put@ngina, and a second reading where 1/| is l and v
 * is u — u1o1, fvck), stretched letters (fuuuck, gaaago), a `*` standing for
 * one letter (f*ck), and a word spelled out one letter at a time (f u c k,
 * p.u.t.a, g-a-g-o).
 *
 * What it knowingly lets through: a bad word split into two multi-letter
 * halves that are only short exact words ("pu ta") — joining every neighbour
 * would block "Bo Bo" as bobo — and anything misspelled past recognition.
 * That residue is what "Report name" and the moderator console are for.
 *
 * Deliberately NOT blocked, because they are ordinary words or real names
 * here: Dick (Gordon), cum (laude), bakla / bayot (identity words people use
 * of themselves), leche (flan), pepe, tae (a Korean given name), kantutay (a
 * shrub on this campus), taranta (panicked), hayop, gaga.
 */

export type NameRefusal = "profanity" | "slur" | "reserved";

export type NameVerdict = { is_ok: true } | { is_ok: false; reason: NameRefusal };

type Match = "exact" | "prefix" | "inside";

interface Entry {
  word: string;
  match: Match;
  kind: NameRefusal;
}

const P = "profanity" as const;
const S = "slur" as const;
const R = "reserved" as const;

/** English and Filipino (Tagalog, some Cebuano). Lower-case, plain a–z. */
const ENTRY: Entry[] = [
  /* English profanity */
  { word: "fuck", match: "inside", kind: P },
  { word: "shit", match: "prefix", kind: P },
  { word: "bitch", match: "prefix", kind: P },
  { word: "cunt", match: "prefix", kind: P },
  { word: "asshole", match: "inside", kind: P },
  { word: "ass", match: "exact", kind: P },
  { word: "dumbass", match: "exact", kind: P },
  { word: "bastard", match: "prefix", kind: P },
  { word: "whore", match: "prefix", kind: P },
  { word: "slut", match: "prefix", kind: P },
  { word: "pussy", match: "exact", kind: P },
  { word: "porn", match: "prefix", kind: P },
  { word: "tits", match: "exact", kind: P },
  { word: "boobs", match: "exact", kind: P },
  { word: "dildo", match: "inside", kind: P },
  { word: "wanker", match: "prefix", kind: P },
  { word: "twat", match: "exact", kind: P },
  { word: "penis", match: "exact", kind: P },
  { word: "vagina", match: "exact", kind: P },
  { word: "rape", match: "exact", kind: P },
  { word: "rapist", match: "exact", kind: P },
  { word: "horny", match: "exact", kind: P },
  /* Slurs and hate */
  { word: "nigger", match: "inside", kind: S },
  { word: "nigga", match: "inside", kind: S },
  { word: "faggot", match: "inside", kind: S },
  { word: "fag", match: "exact", kind: S },
  { word: "fags", match: "exact", kind: S },
  { word: "retard", match: "exact", kind: S },
  { word: "retarded", match: "exact", kind: S },
  { word: "retards", match: "exact", kind: S },
  { word: "tranny", match: "exact", kind: S },
  { word: "chink", match: "exact", kind: S },
  { word: "spic", match: "exact", kind: S },
  { word: "kike", match: "exact", kind: S },
  { word: "chekwa", match: "exact", kind: S },
  { word: "nazi", match: "exact", kind: S },
  { word: "nazis", match: "exact", kind: S },
  { word: "hitler", match: "inside", kind: S },
  { word: "kkk", match: "exact", kind: S },
  /* Filipino profanity */
  { word: "putangina", match: "inside", kind: P },
  { word: "tangina", match: "inside", kind: P },
  { word: "potangina", match: "inside", kind: P },
  { word: "pukingina", match: "inside", kind: P },
  { word: "punyeta", match: "inside", kind: P },
  { word: "pakyu", match: "inside", kind: P },
  { word: "pakshet", match: "inside", kind: P },
  { word: "puta", match: "exact", kind: P },
  { word: "putang", match: "exact", kind: P },
  { word: "pota", match: "exact", kind: P },
  { word: "gago", match: "exact", kind: P },
  { word: "tarantado", match: "exact", kind: P },
  { word: "tarantada", match: "exact", kind: P },
  { word: "ulol", match: "exact", kind: P },
  { word: "ulul", match: "exact", kind: P },
  { word: "bobo", match: "exact", kind: P },
  { word: "tanga", match: "exact", kind: P },
  { word: "kupal", match: "exact", kind: P },
  { word: "burat", match: "exact", kind: P },
  { word: "titi", match: "exact", kind: P },
  { word: "tite", match: "exact", kind: P },
  { word: "etits", match: "exact", kind: P },
  { word: "puke", match: "exact", kind: P },
  { word: "pekpek", match: "exact", kind: P },
  { word: "bilat", match: "exact", kind: P },
  { word: "bayag", match: "exact", kind: P },
  { word: "kantot", match: "prefix", kind: P },
  { word: "kantutan", match: "exact", kind: P },
  { word: "jakol", match: "prefix", kind: P },
  { word: "salsal", match: "exact", kind: P },
  { word: "libog", match: "exact", kind: P },
  { word: "malibog", match: "exact", kind: P },
  { word: "hindot", match: "prefix", kind: P },
  { word: "iyot", match: "exact", kind: P },
  /* Pretending to be the people who run this. */
  { word: "moderator", match: "prefix", kind: R },
  { word: "admin", match: "prefix", kind: R },
];

/** Cyrillic and Greek letters that pass for Latin ones on glass. */
const LOOKALIKE: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", і: "i", ј: "j", ѕ: "s",
  α: "a", ε: "e", ι: "i", κ: "k", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ν: "v",
};

/** Leet, first reading: 1 and | are i. */
const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g",
  "@": "a", $: "s", "!": "i", "|": "i", "+": "t", "€": "e",
};

/** Leet, second reading: 1 and | are l, and v stands in for u (fvck, u1o1). */
const LEET_ALT: Record<string, string> = { ...LEET, "1": "l", "|": "l", v: "u" };

const ZERO_WIDTH = /[­​-‏⁠﻿]/g;

/** Runs of one letter down to one: fuuuck → fuck. */
function collapse(word: string): string {
  return word.replace(/([a-z])\1+/g, "$1");
}

/** Lower-case plain a–z (plus `*`), everything else a separator. */
function readingOf(name: string, leet: Record<string, string>): string {
  const plain = name.normalize("NFKD").replace(/\p{M}/gu, "").replace(ZERO_WIDTH, "").toLowerCase();
  let out = "";
  for (const ch of plain) out += LOOKALIKE[ch] ?? leet[ch] ?? ch;
  return out.replace(/[^a-z*]+/g, " ").trim();
}

/**
 * A word compared with an entry, straight and with stretched letters folded —
 * but the fold only for entries of four letters or more once folded, or "ass"
 * (folded "as") would block the English word "as".
 */
function isSame(word: string, entry: string): boolean {
  if (word === entry) return true;
  const folded = collapse(entry);
  return folded.length >= 4 && collapse(word) === folded;
}

/**
 * A prefix only folds runs of THREE or more (fuuuck, shiiit): folding a double
 * too turns "shiitake" into "shitake", and every prefix entry is short enough
 * for a double to push an innocent word onto it.
 */
function startsWith(word: string, entry: string): boolean {
  return word.startsWith(entry) || word.replace(/([a-z])\1{2,}/g, "$1").startsWith(entry);
}

function contains(text: string, entry: string): boolean {
  return text.includes(entry) || collapse(text).includes(collapse(entry));
}

/** `f*ck`: each `*` is one unknown letter. At least two real letters, at most two stars. */
function wildcardHit(word: string): Entry | null {
  const star = (word.match(/\*/g) ?? []).length;
  if (star === 0 || star > 2 || word.length - star < 2) return null;
  const pattern = new RegExp(`^${word.replace(/\*/g, "[a-z]")}`);
  for (const entry of ENTRY) {
    if (entry.word.length < word.length) continue;
    const head = entry.word.slice(0, word.length);
    if (entry.match === "exact" ? entry.word.length === word.length && pattern.test(entry.word) : pattern.test(head)) {
      return entry;
    }
  }
  return null;
}

function wordHit(word: string): Entry | null {
  if (!word) return null;
  if (word.includes("*")) return wildcardHit(word);
  for (const entry of ENTRY) {
    if (entry.match === "exact" && isSame(word, entry.word)) return entry;
    if (entry.match === "prefix" && startsWith(word, entry.word)) return entry;
    if (entry.match === "inside" && contains(word, entry.word)) return entry;
  }
  return null;
}

function readingHit(reading: string): Entry | null {
  const word = reading.split(" ").filter(Boolean);
  for (const one of word) {
    const hit = wordHit(one);
    if (hit) return hit;
  }
  /* A word spelled out one letter at a time: f u c k, p.u.t.a, g-a-g-o. */
  for (let i = 0; i < word.length; i += 1) {
    if (word[i].length !== 1) continue;
    let j = i;
    let joined = "";
    while (j < word.length && word[j].length === 1) joined += word[j++];
    if (joined.length >= 3) {
      const hit = wordHit(joined);
      if (hit) return hit;
    }
    i = j;
  }
  /* An `inside` stem split anywhere: "fu ck", "Tangi Na Mo", "xXputanginaXx". */
  const whole = word.join("").replace(/\*/g, "");
  for (const entry of ENTRY) if (entry.match === "inside" && contains(whole, entry.word)) return entry;
  return null;
}

/** Is this name fit to print on every phone in the hall? */
export function nameVerdictOf(name: string): NameVerdict {
  for (const leet of [LEET, LEET_ALT]) {
    const hit = readingHit(readingOf(String(name ?? ""), leet));
    if (hit) return { is_ok: false, reason: hit.kind };
  }
  return { is_ok: true };
}

/* ── the fallback ───────────────────────────────────────────────────────── */

/** Tree names on the campus, for generated walker names. Shared with `sync.ts`. */
export const NAME_WORD = [
  "Narra", "Molave", "Katmon", "Dao", "Balete", "Lagundi", "Banaba", "Dita",
  "Kupang", "Amugis", "Palosapis", "Malaruhat", "Salunguguet", "Tibig", "Almaciga",
];

/** FNV-1a — the same hash as `campus-world.ts hashOf`, kept here so this file imports nothing. */
function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * "Molave Walker 12" — the name a phone is minted with, from its player_id.
 * The server can derive the same one from the same id, which is how a refused
 * name falls back to the name that phone started with and not a new stranger.
 */
export function generatedNameOf(seed: string): string {
  const h = fnv(seed);
  return `${NAME_WORD[h % NAME_WORD.length]} Walker ${(h >>> 8) % 97}`;
}

const REASON_LINE: Record<NameRefusal, string> = {
  profanity: "it reads as a swear word",
  slur: "it reads as a slur",
  reserved: "it reads as a moderator or admin",
};

/** What the phone that chose a refused name is told. Never repeats the name. */
export function nameNoticeOf(reason: NameRefusal, fallback: string): string {
  return `Your display name isn't shown to other walkers — ${REASON_LINE[reason]}. They see you as “${fallback}”. Change it in Settings.`;
}

export interface SafeName {
  name: string;
  /** Why the chosen name was replaced, or null when it stands. */
  refusal: NameRefusal | null;
}

/**
 * The name to print for `name`, chosen by the owner of `seed` (a player_id or
 * account_code): itself when it passes, else the generated name for `seed`.
 * Trims and caps at 40 like every name the hall takes.
 */
export function safeNameOf(name: unknown, seed: string, fallback_empty = "Walker"): SafeName {
  const clean = String(name ?? "").trim().slice(0, 40);
  if (!clean) return { name: fallback_empty, refusal: null };
  const verdict = nameVerdictOf(clean);
  if (verdict.is_ok) return { name: clean, refusal: null };
  return { name: generatedNameOf(seed), refusal: verdict.reason };
}
