/**
 * What kind of living thing a find is.
 *
 * The problem this solves: the campus pool is 1,098 species and exactly 25 of
 * them have curated artwork. Everything else fell through to one generic plant
 * silhouette, so a list of four finds — a grass, a butterfly, a bracket fungus
 * and a bird — drew as four identical grey blobs. That is not a missing asset,
 * it is a wrong statement: it says "plant" about a bird.
 *
 * So an uncurated find says the one thing we DO know from the sweep — its
 * iNaturalist iconic taxon — and says it as a shape. Eleven groups, drawn, not
 * invented: no made-up species portrait, no colour that implies a field mark.
 *
 * `archetype` refines two cases the iconic taxon is too coarse for, because
 * the model pack already distinguishes them and a walker would too: a mushroom
 * that is a bracket, and a plant that is a tree.
 */

export type Kind =
  | "plant"
  | "tree"
  | "fungus"
  | "bracket"
  | "insect"
  | "butterfly"
  | "spider"
  | "bird"
  | "reptile"
  | "amphibian"
  | "fish"
  | "mollusc"
  | "mammal"
  | "other";

export const KIND_LABEL: Record<Kind, string> = {
  plant: "Plant",
  tree: "Tree",
  fungus: "Fungus",
  bracket: "Bracket fungus",
  insect: "Insect",
  butterfly: "Butterfly or moth",
  spider: "Spider",
  bird: "Bird",
  reptile: "Reptile",
  amphibian: "Amphibian",
  fish: "Fish",
  mollusc: "Snail or slug",
  mammal: "Mammal",
  other: "Animal",
};

const TREE_ARCHETYPE = new Set(["tree", "tree-balete", "palm", "papaya", "cycad", "pandanus", "bananaKind"]);

/**
 * Kind from what the sweep actually recorded.
 *
 * Order matters: `archetype` is the finer fact and wins where it disagrees, so
 * a Fungi whose archetype is `mushroom-bracket` reads as a bracket rather than
 * as a generic toadstool.
 */
export function kindOf(iconic_taxon_name: string, archetype: string): Kind {
  if (archetype.startsWith("mushroom-bracket")) return "bracket";
  if (archetype.startsWith("lepidoptera")) return "butterfly";
  if (archetype.startsWith("spider")) return "spider";
  if (TREE_ARCHETYPE.has(archetype)) return "tree";

  switch (iconic_taxon_name) {
    case "Plantae":
      return "plant";
    case "Fungi":
      return "fungus";
    case "Insecta":
      return "insect";
    case "Arachnida":
      return "spider";
    case "Aves":
      return "bird";
    case "Reptilia":
      return "reptile";
    case "Amphibia":
      return "amphibian";
    case "Actinopterygii":
      return "fish";
    case "Mollusca":
      return "mollusc";
    case "Mammalia":
      return "mammal";
    default:
      return "other";
  }
}

/**
 * Display casing for a common name.
 *
 * The sweep's `common_name` arrives however iNaturalist stored it — "Great
 * Eggfly" beside "broadleaf carpetgrass" beside "false ashoka" — and a list
 * that mixes the two reads as a data bug. Only the FIRST word is touched: a
 * name whose later words are proper ("Philippine Hanging-Parrot") must not be
 * flattened, and one that is not ("broadleaf carpetgrass") must not be
 * title-cased into a species it is not.
 */
export function displayName(common_name: string): string {
  if (!common_name) return common_name;
  return common_name.charAt(0).toUpperCase() + common_name.slice(1);
}

/**
 * Title Case for a DISPLAY slot that lists names side by side (the Nearby
 * tray), where "aji pepper" beside "Yellow Flame Tree" reads as a data bug.
 * Only first letters are raised — nothing is lowered, so "Hanging-Parrot" and
 * an all-caps acronym survive — and the stored name is never touched.
 */
export function titleName(common_name: string): string {
  return common_name.replace(/(^|[\s(/-])(\p{Ll})/gu, (_m, lead: string, letter: string) => lead + letter.toUpperCase());
}
