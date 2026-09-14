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
