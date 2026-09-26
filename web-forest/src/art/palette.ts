/**
 * The one palette the vector art is drawn in — the Magisphere poster hexes
 * (`script/magi-asset/build-vector.mjs`) plus the eagle's blues, which the pet
 * lane chose first. `test/art.test.ts` fails a file under `src/art/svg/` that
 * paints with a hex not listed here, so the set cannot drift one icon at a time.
 */
export const palette = {
  ink: "#0E3B2A",
  forest: "#114B2F",
  teal_deep: "#11646C",
  teal: "#279CAD",
  green: "#3E9A4A",
  leaf: "#7CC84A",
  lime: "#C8E88C",
  sky: "#AADCFC",
  sky_deep: "#58B8E8",
  blue: "#2F80D8",
  sun: "#F5C842",
  gold: "#F5B82E",
  gold_deep: "#C98A12",
  orange: "#F59A23",
  cream: "#FFF6DC",
  path: "#F3E3B5",
  wood: "#A8582C",
  wood_dark: "#6B3519",
  red: "#E8483A",
  blush: "#F58A6E",
  stone: "#8A96A3",
  stone_deep: "#5B6773",
  stone_light: "#C9D2DB",
  eagle: "#3463B5",
  eagle_deep: "#24478A",
  eagle_light: "#5B86D6",
  white: "#FFFFFF",
} as const;

export type PaletteKey = keyof typeof palette;
