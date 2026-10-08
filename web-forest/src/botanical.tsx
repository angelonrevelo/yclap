/* The botanical plates stay raster — they are illustrations, not UI, and the
   vector attempts under asset/species read as clip-art beside them. Imported
   here directly so nothing pulls the retired PNG kit (`asset/kit.ts`) into the
   build. */
const plate = import.meta.glob<string>("./asset/species/*.png", { eager: true, import: "default" });
const species_art: Record<string, string> = Object.fromEntries(
  Object.entries(plate).map(([file, url]) => [file.slice(file.lastIndexOf("/") + 1, -4), url]),
);

type Props = { species_code: string; is_silhouette?: boolean; size?: number };

export default function Botanical({ species_code, is_silhouette, size }: Props) {
  const src = !is_silhouette && species_art[species_code] ? species_art[species_code] : species_art.silhouette;
  return (
    <div style={{ width: size ?? "100%", aspectRatio: "1 / 1" }}>
      <img src={src} alt="" style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
