import { useEffect, useState, type CSSProperties } from "react";
import Botanical from "./botanical";
import { species } from "./data";
import { kindOf, type Kind } from "./kind";
import { KindThumb } from "./kind-mark";
import { loadTaxonPortrait, seededPortrait } from "./taxon-photo";

export function usePortrait(scientific_name: string | null | undefined): string | null {
  const name = scientific_name?.trim() ?? "";
  const [url, setUrl] = useState<string | null>(() => (name ? seededPortrait(name) : null));

  useEffect(() => {
    if (!name) {
      setUrl(null);
      return;
    }
    const seeded = seededPortrait(name);
    if (seeded) {
      setUrl(seeded);
      return;
    }
    let is_alive = true;
    loadTaxonPortrait(name).then((next) => {
      if (is_alive) setUrl(next);
    });
    return () => {
      is_alive = false;
    };
  }, [name]);

  return url;
}

/**
 * Circular close-up — iNat photo when we have one, kit drawing while it
 * loads, schematic kind mark only when neither exists.
 */
export function SpeciesPortrait({
  scientific_name,
  species_code,
  kind,
  size = 48,
  is_dim = false,
  photo_data = null,
  style,
}: {
  scientific_name?: string | null;
  species_code?: string;
  kind?: Kind;
  size?: number;
  is_dim?: boolean;
  photo_data?: string | null;
  style?: CSSProperties;
}) {
  const sp = species_code ? species[species_code] : undefined;
  const name = scientific_name?.trim() || sp?.scientific_name || "";
  const portrait = usePortrait(is_dim ? null : name);
  const src = photo_data || portrait;
  const mark = kind ?? kindOf("Plantae", "tree");

  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 999,
        overflow: "hidden",
        background: "rgba(12,28,16,0.12)",
        border: "2px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 12px rgba(12,28,16,0.22)",
        display: "grid",
        placeItems: "center",
        ...style,
      }}
    >
      {src && !is_dim ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : species_code ? (
        <div style={{ width: "86%", opacity: is_dim ? 0.55 : 1, filter: is_dim ? "grayscale(1)" : undefined }}>
          <Botanical species_code={species_code} is_silhouette={is_dim || !sp} />
        </div>
      ) : (
        <KindThumb kind={mark} size={size - 4} />
      )}
    </div>
  );
}
