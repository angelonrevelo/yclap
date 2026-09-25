import { useEffect, useState, type CSSProperties } from "react";
import Botanical from "./botanical";
import { species } from "./data";
import { kindOf, type Kind } from "./kind";
import { KindThumb } from "./kind-mark";
import { knownPortrait, loadTaxonPortrait, seededPortrait } from "./taxon-photo";

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
 * True when `url` is already decoded in the browser's image cache, so drawing
 * it costs no network and no swap. A fresh `Image` with a cached src reports
 * `complete` synchronously; anything still to fetch does not.
 */
function isPhotoReady(url: string | null): boolean {
  if (!url || typeof Image === "undefined") return false;
  const probe = new Image();
  probe.src = url;
  return probe.complete && probe.naturalWidth > 0;
}

/**
 * Circular close-up — iNat photo when we have one, kit drawing while it
 * loads, schematic kind mark only when neither exists.
 *
 * `is_settled` (the 3D model's loading poster) picks ONE picture on first
 * paint and keeps it: the photo if it is already in the image cache, else the
 * drawing. Round 5 watched the poster swap from the tree sticker to a flower
 * photo halfway through the model load (zoom5) — two pictures, then a third.
 */
export function SpeciesPortrait({
  scientific_name,
  species_code,
  kind,
  size = 48,
  is_dim = false,
  photo_data = null,
  is_settled = false,
  style,
}: {
  scientific_name?: string | null;
  species_code?: string;
  kind?: Kind;
  size?: number;
  is_dim?: boolean;
  photo_data?: string | null;
  is_settled?: boolean;
  style?: CSSProperties;
}) {
  const sp = species_code ? species[species_code] : undefined;
  const name = scientific_name?.trim() || sp?.scientific_name || "";
  const [settled_photo] = useState(() => {
    if (!is_settled) return null;
    const url = photo_data || knownPortrait(name);
    return isPhotoReady(url) ? url : null;
  });
  const portrait = usePortrait(is_dim || is_settled ? null : name);
  const src = is_settled ? settled_photo : photo_data || portrait;
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
        boxShadow: "var(--mg-shadow-sm)",
        display: "grid",
        placeItems: "center",
        position: "relative",
        ...style,
      }}
    >
      {/* The drawing (or kind mark) is always laid down first, and the photo
          fades in over it once it has actually loaded — a remote iNat photo
          used to leave a blank grey disc for as long as it took. */}
      {sp && species_code ? (
        <div style={{ gridArea: "1 / 1", width: "86%", opacity: is_dim ? 0.55 : 1, filter: is_dim ? "grayscale(1)" : undefined }}>
          <Botanical species_code={species_code} is_silhouette={is_dim} />
        </div>
      ) : (
        <div style={{ gridArea: "1 / 1", opacity: is_dim ? 0.55 : 1, display: "grid", placeItems: "center" }}>
          <KindThumb kind={mark} size={size - 4} />
        </div>
      )}
      {src && !is_dim && <PortraitPhoto key={src} src={src} />}
    </div>
  );
}

function PortraitPhoto({ src }: { src: string }) {
  const [is_loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt=""
      onLoad={() => setLoaded(true)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        opacity: is_loaded ? 1 : 0,
        transition: "opacity 180ms ease",
      }}
    />
  );
}
