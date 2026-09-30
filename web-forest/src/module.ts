/**
 * Campus modules — the map as an engine other layers plug into.
 *
 * Gelo's 09-30 note: the judges "said that the 3D implementation was good …
 * they can also use it for something else like hazards, DRR … to showcase
 * hiking trails, or even emergency areas in school, or even areas with
 * biodiversity" (`3:58`–`4:46`), and "we have the engines for that, but we can
 * even apply it to other things like hiking trails" (`4:53`–`5:11`). A module
 * is that sentence as code: one layer of meaning over the same sectors, paths
 * and routing, switched on per campus by config, not by a fork.
 *
 * Every module states its SOURCE and the office that would have to sign it
 * off. `is_official` stays false until that office has actually done so —
 * the same rule `settings-content.ts` holds for `is_confirmed`, and for the
 * same reason: for the emergency layer, a phone implying it is the university's
 * plan when it is volunteer map data is a safety failure, not a copy slip.
 * `module.test.ts` fails the build the day any module claims otherwise
 * without that test being edited to say who signed what, when.
 */
import emergency_file from "./asset/campus-emergency.json" with { type: "json" };
import flood_file from "./asset/campus-flood.json" with { type: "json" };
import hotspot_file from "./asset/campus-hotspot.json" with { type: "json" };

export type ModuleId = "hotspot" | "emergency" | "trail";

export interface CampusModule {
  module_id: ModuleId;
  title: string;
  /** One line a student can read at a booth. */
  blurb: string;
  /** Where every mark this module draws comes from, with its date. */
  source: string;
  /**
   * TRUE only once `official_owner` has signed the layer off. False for every
   * module today; `module.test.ts` holds it.
   */
  is_official: boolean;
  /** Who would have to sign it off before it could say it is theirs. */
  official_owner: string;
  /** What that office would have to give us — the ask, not the hope. */
  institution_ask: string;
  /** Shown over the whole layer while `is_official` is false. */
  caveat: string;
}

export const MODULE: CampusModule[] = [
  {
    module_id: "hotspot",
    title: "Biodiversity hotspots",
    blurb: "Where on campus people have recorded the most species, beside how green that ground measures.",
    source: `${hotspot_file.source} (fetched ${hotspot_file.fetched_on}); vegetation measured off Esri World Imagery; sectors © OpenStreetMap contributors, ODbL`,
    is_official: false,
    official_owner: "Ateneo Institute of Sustainability (AIS)",
    institution_ask: "The campus tree inventory with positions, so richness comes from a survey and not only from where people happen to point a phone.",
    caveat: "Observation counts, not a survey. iNaturalist records follow where people walk and look.",
  },
  {
    module_id: "emergency",
    title: "Emergency & DRR",
    blurb: "Clinics, safety offices and fire equipment volunteers have mapped, the published flood model, and the walk to the nearest help.",
    source: `${emergency_file.source} (fetched ${emergency_file.fetched_on}, ${emergency_file.licence}); ${flood_file.source} (shapefile ${flood_file.shapefile_date}, ${flood_file.licence})`,
    is_official: false,
    official_owner: "the university DRRM office and CFMO",
    institution_ask: "The official emergency plan: assembly points, evacuation routes, first-aid and AED locations, and the hazard areas they already track.",
    caveat: "Not the official Ateneo emergency plan. In an emergency follow campus safety staff and the university's own instructions.",
  },
  {
    module_id: "trail",
    title: "Nature trails",
    blurb: "A walk of ordered stops over the footpaths, a card at each, with the distance and time between them.",
    source: "Stops and order chosen by us (is_named_by_us); routed over OpenStreetMap footpaths, ODbL",
    is_official: false,
    official_owner: "Ateneo Institute of Sustainability (AIS) and The Ateneo Wild",
    institution_ask: "Which trees are safe and worth stopping at, and the stories that belong to them.",
    caveat: "A walk we laid out. Stop positions are the app's demo points, not surveyed trees.",
  },
];

/**
 * Which modules a deployment runs. The "deploy anywhere" story: another campus
 * or a park ships its own `campus_code` and switches on only what it has data
 * for — a park with no emergency extract runs `["trail"]` and never shows an
 * empty safety layer pretending to be one.
 */
export interface ModuleConfig {
  campus_code: string;
  campus_name: string;
  module_on: ModuleId[];
}

export const MODULE_CONFIG: ModuleConfig = {
  campus_code: "admu-loyola",
  campus_name: "Ateneo de Manila, Loyola Heights",
  module_on: ["hotspot", "emergency", "trail"],
};

/** The modules a config switches on, in registry order. */
export function enabledModule(config: ModuleConfig = MODULE_CONFIG): CampusModule[] {
  return MODULE.filter((m) => config.module_on.includes(m.module_id));
}

export function moduleById(module_id: ModuleId): CampusModule {
  const found = MODULE.find((m) => m.module_id === module_id);
  if (!found) throw new Error(`no module ${module_id}`);
  return found;
}

/**
 * `?module=trail,hotspot` narrows the running config for a demo — a park pitch
 * can show just the trail. Unknown ids are dropped; an empty result keeps the
 * config as it was rather than switching everything off by typo.
 */
export function configFromQuery(search: string, config: ModuleConfig = MODULE_CONFIG): ModuleConfig {
  const raw = new URLSearchParams(search).get("module");
  if (!raw) return config;
  const known = new Set(MODULE.map((m) => m.module_id));
  const pick = raw.split(",").map((s) => s.trim()).filter((s): s is ModuleId => known.has(s as ModuleId));
  return pick.length ? { ...config, module_on: pick } : config;
}
