/**
 * The vector kit — every file under `svg/`, as markup strings for `<Art>`.
 * Keys match the PNG kit they replaced (`asset/kit.ts`) so a call site swaps
 * `icon.map` for `glyph.map` and nothing else moves.
 */
import g_camera from "./svg/glyph/camera.svg?raw";
import g_canopy from "./svg/glyph/canopy.svg?raw";
import g_check from "./svg/glyph/check.svg?raw";
import g_close from "./svg/glyph/close.svg?raw";
import g_encounter from "./svg/glyph/encounter.svg?raw";
import g_export from "./svg/glyph/export.svg?raw";
import g_go_camera from "./svg/glyph/go_camera.svg?raw";
import g_home from "./svg/glyph/home.svg?raw";
import g_journal from "./svg/glyph/journal.svg?raw";
import g_leaf_scan from "./svg/glyph/leaf_scan.svg?raw";
import g_locate from "./svg/glyph/locate.svg?raw";
import g_map from "./svg/glyph/map.svg?raw";
import g_pin from "./svg/glyph/pin.svg?raw";
import g_plan from "./svg/glyph/plan.svg?raw";
import g_player from "./svg/glyph/player.svg?raw";
import g_restricted from "./svg/glyph/restricted.svg?raw";
import g_shutter from "./svg/glyph/shutter.svg?raw";
import g_walk from "./svg/glyph/walk.svg?raw";
import s_about from "./svg/glyph/settings-about.svg?raw";
import s_account from "./svg/glyph/settings-account.svg?raw";
import s_partner from "./svg/glyph/settings-partner.svg?raw";
import s_pref from "./svg/glyph/settings-pref.svg?raw";
import s_roadmap from "./svg/glyph/settings-roadmap.svg?raw";
import s_stage from "./svg/glyph/settings-stage.svg?raw";
import game_dex from "./svg/game/dex.svg?raw";
import game_go from "./svg/game/go.svg?raw";
import game_level from "./svg/game/level.svg?raw";
import game_lock from "./svg/game/lock.svg?raw";
import game_nearby from "./svg/game/nearby.svg?raw";
import game_plan from "./svg/game/plan.svg?raw";
import game_points from "./svg/game/points.svg?raw";
import game_quest from "./svg/game/quest.svg?raw";
import game_streak from "./svg/game/streak.svg?raw";
import game_trophy from "./svg/game/trophy.svg?raw";
import m_cheer from "./svg/mascot/cheer.svg?raw";
import m_hiker from "./svg/mascot/hiker.svg?raw";
import m_map from "./svg/mascot/map.svg?raw";
import m_sleep from "./svg/mascot/sleep.svg?raw";
import m_sprout from "./svg/mascot/sprout.svg?raw";
import m_trail from "./svg/mascot/trail.svg?raw";
import e_egg from "./svg/eagle/egg.svg?raw";
import e_sprout from "./svg/eagle/sprout.svg?raw";
import e_sapling from "./svg/eagle/sapling.svg?raw";
import e_tree from "./svg/eagle/tree.svg?raw";
import type { Stage } from "../stage.ts";

/** UI glyphs — nav tabs, row icons, round button faces. */
export const glyph = {
  camera: g_camera,
  canopy: g_canopy,
  check: g_check,
  close: g_close,
  encounter: g_encounter,
  export: g_export,
  go_camera: g_go_camera,
  home: g_home,
  journal: g_journal,
  leaf_scan: g_leaf_scan,
  locate: g_locate,
  map: g_map,
  pin: g_pin,
  plan: g_plan,
  player: g_player,
  restricted: g_restricted,
  shutter: g_shutter,
  walk: g_walk,
};

/** Settings tab art, keyed like `SettingsIcon`. */
export const settings_glyph = {
  about: s_about,
  account: s_account,
  partner: s_partner,
  pref: s_pref,
  roadmap: s_roadmap,
  stage: s_stage,
};

/**
 * Game icons — the chess.com-style set Gelo asked to keep (09-25, `1:09`),
 * redrawn as vector in the Magisphere palette rather than recoloured PNGs.
 */
export const game = {
  dex: game_dex,
  go: game_go,
  level: game_level,
  lock: game_lock,
  nearby: game_nearby,
  plan: game_plan,
  points: game_points,
  quest: game_quest,
  streak: game_streak,
  trophy: game_trophy,
};

/** Sprout, the mascot, in the poses the sticker set had. */
export const mascot = {
  cheer: m_cheer,
  hiker: m_hiker,
  map: m_map,
  sleep: m_sleep,
  sprout: m_sprout,
  trail: m_trail,
};

/**
 * The buddy is Agila, the Blue Eagle: egg → hatchling → eaglet → flying. The
 * stage KEYS stay the plant-era ones on purpose — they are stored on devices
 * and asserted by tests; only the art and the label (`stage.ts`) changed.
 * The flying eagle's wings carry `wing-l` / `wing-r` (and the pet lane's
 * `pet-wing-*`), so `art.css` can flap them.
 */
export const eagle: Record<Stage, string> = {
  egg: e_egg,
  sprout: e_sprout,
  sapling: e_sapling,
  tree: e_tree,
};
