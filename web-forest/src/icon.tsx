import type { CSSProperties } from "react";
import plant_mark from "./asset/mark/plant.svg";
import { Art } from "./art/art";
import { glyph } from "./art";

type IconProps = { size?: number; active?: boolean; style?: CSSProperties };

/** Inline vector (`art/svg/glyph`), not an <img> — no request, sharp at any size. */
function Glyph({ src, size, style }: { src: string; size: number; style?: CSSProperties }) {
  return <Art svg={src} size={size} style={style} />;
}

export function HomeIcon({ size = 24, active }: IconProps) {
  return <Glyph src={glyph.home} size={size} style={{ opacity: active === false ? 0.72 : 1 }} />;
}

export function MapIcon({ size = 24, active }: IconProps) {
  return <Glyph src={glyph.map} size={size} style={{ opacity: active === false ? 0.72 : 1 }} />;
}

export function JournalIcon({ size = 24, active }: IconProps) {
  return <Glyph src={glyph.journal} size={size} style={{ opacity: active === false ? 0.72 : 1 }} />;
}

export function PlanIcon({ size = 24, active }: IconProps) {
  return <Glyph src={glyph.plan} size={size} style={{ opacity: active === false ? 0.72 : 1 }} />;
}

export function CheckIcon({ size = 22 }: { size?: number }) {
  return <Glyph src={glyph.check} size={size} />;
}

export function PinIcon({ size = 22 }: { size?: number }) {
  return <Glyph src={glyph.pin} size={size} />;
}

export function CameraIcon({ size = 22 }: { size?: number }) {
  return <Glyph src={glyph.camera} size={size} />;
}

export function RestrictedIcon({ size = 22 }: { size?: number }) {
  return <Glyph src={glyph.restricted} size={size} />;
}

export function CanopyIcon({ size = 22 }: { size?: number }) {
  return <Glyph src={glyph.canopy} size={size} />;
}

/** Leaf inside viewfinder brackets — "identify this", never "we identified it". */
export function LeafScanIcon({ size = 22 }: { size?: number }) {
  return <Glyph src={glyph.leaf_scan} size={size} />;
}

export function LocateIcon({ size = 22 }: { size?: number }) {
  return <Glyph src={glyph.locate} size={size} />;
}

export function WalkIcon({ size = 22 }: { size?: number }) {
  return <Glyph src={glyph.walk} size={size} />;
}

/** The big round capture control. Reads at 64px on the map, not in a list row. */
export function ShutterIcon({ size = 30 }: { size?: number }) {
  return <Glyph src={glyph.shutter} size={size} />;
}

export function ExportIcon({ size = 20 }: { size?: number }) {
  return <Glyph src={glyph.export} size={size} />;
}

export function EncounterDisc({ size = 32 }: { size?: number }) {
  return <Glyph src={glyph.encounter} size={size} />;
}

export function PlayerMark({ size = 20 }: { size?: number }) {
  return <Glyph src={glyph.player} size={size} />;
}

export function PlantMark({ size = 32 }: { size?: number }) {
  return <img src={plant_mark} width={size} height={size} alt="" aria-hidden="true" />;
}

/** @deprecated Field Guide header uses PlantMark. Kept for program chrome. */
export function FourPersonMark({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/brand/logo-upright.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}

export function LeafMark({ size = 40 }: { size?: number; color?: string }) {
  return <PlantMark size={size} />;
}

export function CloseIcon({ size = 22 }: { size?: number }) {
  return <Glyph src={glyph.close} size={size} />;
}
