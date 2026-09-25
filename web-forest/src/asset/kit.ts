import settings_account from "./icon/settings/account.png";
import settings_pref from "./icon/settings/pref.png";
import settings_roadmap from "./icon/settings/roadmap.png";
import settings_stage from "./icon/settings/stage.png";
import settings_about from "./icon/settings/about.png";
import settings_partner from "./icon/settings/partner.png";
import home from "./icon/home.png";
import map from "./icon/map.png";
import journal from "./icon/journal.png";
import plan from "./icon/plan.png";
import check from "./icon/check.png";
import pin from "./icon/pin.png";
import camera from "./icon/camera.png";
import close from "./icon/close.png";
import encounter from "./icon/encounter.png";
import player from "./icon/player.png";
import restricted from "./icon/restricted.png";
import canopy from "./icon/canopy.png";
import leaf_scan from "./icon/leaf_scan.png";
import locate from "./icon/locate.png";
import walk from "./icon/walk.png";
import shutter from "./icon/shutter.png";
import go_camera from "./icon/go_camera.png";
import export_ from "./icon/export.png";
import plant from "./mark/plant.png";
import narra from "./species/narra.png";
import molave from "./species/molave.png";
import katmon from "./species/katmon.png";
import mahogany from "./species/mahogany.png";
import lagundi from "./species/lagundi.png";
import dao from "./species/dao.png";
import raintree from "./species/raintree.png";
import teak from "./species/teak.png";
import balete from "./species/balete.png";
import silhouette from "./species/silhouette.png";
import game_dex from "./magi/icon/dex.svg";
import game_go from "./magi/icon/go.svg";
import game_nearby from "./magi/icon/nearby.svg";
import game_level from "./magi/icon/level.svg";
import game_lock from "./magi/icon/lock.svg";
import game_plan from "./magi/icon/plan.svg";
import game_points from "./magi/icon/points.svg";
import game_quest from "./magi/icon/quest.svg";
import game_streak from "./magi/icon/streak.svg";
import game_trophy from "./magi/icon/trophy.svg";
import game_buddy from "./magi/icon/buddy.svg";
import game_pin from "./magi/icon/pin.svg";
import sticker_buddy_sprout from "./magi/web/buddy-sprout.webp";
import sticker_buddy_cheer from "./magi/web/buddy-cheer.webp";
import sticker_buddy_map from "./magi/web/buddy-map.webp";
import sticker_buddy_sleep from "./magi/web/buddy-sleep.webp";
import sticker_buddy_trail from "./magi/web/buddy-trail.webp";
import sticker_hiker from "./magi/web/hiker.webp";
import sticker_stage_seed from "./magi/web/stage-seed.webp";
import sticker_stage_seedling from "./magi/web/stage-seedling.webp";
import sticker_stage_sapling from "./magi/web/stage-sapling.webp";
import sticker_stage_tree from "./magi/web/stage-tree.webp";
import empty_journal from "./spot/empty_journal.png";
import success_log from "./spot/success_log.png";
import log_sighting from "./spot/log_sighting.png";

/** Kit ink + fill — Gargar outline language, Field Guide tokens. */
export const ink = {
  line: "#1F2022",
  leaf: "#3F8A1F",
  leaf_bright: "#45C223",
  leaf_deep: "#008653",
  blue: "#57A8E8",
  blue_pwa: "#058CD6",
  mustard: "#E1A036",
  mustard_pwa: "#F6B22D",
};

export const icon = {
  home,
  map,
  journal,
  plan,
  check,
  pin,
  camera,
  close,
  encounter,
  player,
  restricted,
  canopy,
  leaf_scan,
  locate,
  walk,
  shutter,
  go_camera,
  /* `export` is a reserved word — the key is what the UI reads. */
  export: export_,
};

/**
 * Game icons — Magisphere vector stickers, drawn by
 * `script/magi-asset/build-vector.mjs`: forest outline, flat cel shading, a
 * white sticker border. Vector on purpose — they live at 15–52 px, where a
 * downscaled render goes soft. Replaced the chess.com-style set (09-23).
 */
export const game_icon = {
  buddy: game_buddy,
  pin: game_pin,
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

/**
 * The Magisphere sticker set — the Sprout buddy, its four growth stages and the
 * explorer, generated with `codex` (gpt-image-2) on a magenta key and remapped
 * to the brand palette (`script/magi-asset/sticker.spec.json`). 1024 px masters
 * sit in `magi/sticker`; these are the trimmed 400 px WebP copies the app ships.
 */
export const sticker = {
  buddy_sprout: sticker_buddy_sprout,
  buddy_cheer: sticker_buddy_cheer,
  buddy_map: sticker_buddy_map,
  buddy_sleep: sticker_buddy_sleep,
  buddy_trail: sticker_buddy_trail,
  hiker: sticker_hiker,
};

/** One sticker per growth stage, keyed like `Stage` in stage.ts. */
export const stage_sticker = {
  egg: sticker_stage_seed,
  sprout: sticker_stage_seedling,
  sapling: sticker_stage_sapling,
  tree: sticker_stage_tree,
};

export const mark = {
  plant,
};

export const species_art: Record<string, string> = {
  narra,
  molave,
  katmon,
  mahogany,
  lagundi,
  dao,
  raintree,
  teak,
  balete,
  silhouette,
};

export const spot = {
  empty_journal,
  success_log,
  log_sighting,
};

/**
 * Settings-tab section art.
 *
 * Generated by `script/icon/gen-settings-icon.sh` on a magenta ground and keyed
 * by `script/icon/keyer.py`, same contract as the game set above. Every key is
 * optional on purpose: the Settings sections render headed-but-plain when a
 * piece is missing, so a half-generated set never breaks the screen.
 */
export const settings_icon: {
  account?: string;
  pref?: string;
  roadmap?: string;
  stage?: string;
  partner?: string;
  about?: string;
} = {
  partner: settings_partner,
  about: settings_about,
  account: settings_account,
  pref: settings_pref,
  roadmap: settings_roadmap,
  stage: settings_stage,
};
