import type { CSSProperties, ReactNode } from "react";
import Botanical from "./botanical";
import { species, type Origin, type Species } from "./data";

/**
 * Shared surface language.
 *
 * The kit art used to ship with a cream rectangle baked behind every drawing,
 * so the UI never had to supply a container. `script/deplate.py` keyed those
 * plates out; this file is the container that replaces them — one place that
 * decides how a species reads, instead of a different ad-hoc wash per screen.
 *
 * The reference is iNaturalist / Seek: a circular taxon thumbnail with a ring
 * that carries the taxon's own colour, a name over an italic scientific name,
 * and a meta line underneath. Everything else is spacing.
 */

export const RADIUS = { card: 24, tile: 20, pill: 999 } as const;

export interface Accent {
  /** Line and text colour. */
  ink: string;
  /** Wash behind the art. */
  wash: string;
  /** Ring around the thumbnail. */
  ring: string;
}

const ACCENT: Record<Origin | "unknown" | "threatened", Accent> = {
  Native: { ink: "#008653", wash: "rgba(0,134,83,0.09)", ring: "rgba(0,134,83,0.34)" },
  Exotic: { ink: "#8a5d00", wash: "rgba(246,178,45,0.14)", ring: "rgba(246,178,45,0.5)" },
  threatened: { ink: "#c22a17", wash: "rgba(255,57,32,0.09)", ring: "rgba(255,57,32,0.32)" },
  unknown: { ink: "#6c7276", wash: "rgba(31,32,34,0.055)", ring: "rgba(31,32,34,0.2)" },
};

/** Threatened outranks origin — it is the fact a field guide should lead with. */
export function accentFor(sp: Species | undefined): Accent {
  if (!sp) return ACCENT.unknown;
  if (sp.pill.includes("Threatened")) return ACCENT.threatened;
  return ACCENT[sp.origin];
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "native" | "exotic" | "threatened" | "info";
}) {
  const map = {
    neutral: { bg: "#eef1f0", fg: "#1F2022", bd: "#E4E7E8" },
    native: { bg: "rgba(0,134,83,0.12)", fg: "#008653", bd: "rgba(0,134,83,0.3)" },
    exotic: { bg: "rgba(246,178,45,0.16)", fg: "#8a5d00", bd: "rgba(246,178,45,0.45)" },
    threatened: { bg: "rgba(255,57,32,0.1)", fg: "#c22a17", bd: "rgba(255,57,32,0.3)" },
    info: { bg: "rgba(5,140,214,0.1)", fg: "#075D89", bd: "rgba(5,140,214,0.28)" },
  }[tone];
  return (
    <span
      className="inline-flex items-center"
      style={{
        background: map.bg,
        color: map.fg,
        border: `1px solid ${map.bd}`,
        borderRadius: RADIUS.pill,
        fontWeight: 700,
        fontSize: 11,
        lineHeight: 1,
        padding: "6px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function pillTone(label: string): "native" | "exotic" | "threatened" | "neutral" {
  if (label === "Native") return "native";
  if (label === "Exotic") return "exotic";
  if (label === "Threatened" || label === "not yet") return "threatened";
  return "neutral";
}

/**
 * The one badge to show when there is room for exactly one.
 *
 * Threatened outranks origin, so the ring and the badge always agree — a red
 * ring beside a green "Native" pill read as a bug in review, and was one.
 */
export function PrimaryPill({ sp }: { sp: Species }) {
  return sp.pill.includes("Threatened") ? (
    <Pill tone="threatened">Threatened</Pill>
  ) : (
    <Pill tone={pillTone(sp.origin)}>{sp.origin}</Pill>
  );
}

export function SpeciesPill({ sp, limit }: { sp: Species; limit?: number }) {
  const row = limit ? sp.pill.slice(0, limit) : sp.pill;
  return (
    <div className="flex flex-wrap gap-1.5">
      {row.map((p) => (
        <Pill key={p} tone={pillTone(p)}>
          {p}
        </Pill>
      ))}
    </div>
  );
}

/**
 * Circular taxon thumbnail — the unit the whole app repeats.
 * `is_dim` renders the not-yet-seen state without inventing a second artwork.
 */
export function TaxonThumb({
  species_code,
  size = 56,
  is_dim = false,
  photo_data = null,
  style,
}: {
  species_code: string;
  size?: number;
  is_dim?: boolean;
  photo_data?: string | null;
  style?: CSSProperties;
}) {
  const sp = species[species_code];
  const accent = is_dim ? ACCENT.unknown : accentFor(sp);
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: RADIUS.pill,
        background: accent.wash,
        border: `2px solid ${accent.ring}`,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        ...style,
      }}
    >
      {photo_data ? (
        <img src={photo_data} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "82%", opacity: is_dim ? 0.55 : 1, filter: is_dim ? "grayscale(1)" : undefined }}>
          <Botanical species_code={species_code} is_silhouette={is_dim || !sp} />
        </div>
      )}
    </div>
  );
}

/** Name over italic scientific name. The two-line block every surface reuses. */
export function TaxonName({
  sp,
  size = 17,
  eyebrow,
  meta,
}: {
  sp: Species;
  size?: number;
  eyebrow?: string;
  meta?: ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      {eyebrow && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--ui-accent)",
            letterSpacing: "0.07em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {eyebrow}
        </div>
      )}
      <div style={{ fontWeight: 800, fontSize: size, lineHeight: 1.15, marginTop: eyebrow ? 3 : 0 }}>
        {sp.common_name}
      </div>
      <div style={{ fontStyle: "italic", fontSize: size * 0.72, color: "rgba(31,32,34,0.6)", marginTop: 1 }}>
        {sp.scientific_name}
      </div>
      {meta && <div style={{ marginTop: 4 }}>{meta}</div>}
    </div>
  );
}

/** Big round primary action — the shutter, and the pattern every FAB follows. */
export function Fab({
  label,
  onClick,
  children,
  tone = "leaf",
  size = 62,
  style,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "leaf" | "paper";
  size?: number;
  style?: CSSProperties;
}) {
  const is_leaf = tone === "leaf";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS.pill,
        display: "grid",
        placeItems: "center",
        /* The kit glyphs are green on ink. A green disc would swallow them, so
           the disc is paper and the ring carries the brand colour instead. */
        background: "#F9F9F9",
        border: is_leaf ? "4px solid var(--ui-accent)" : "1.5px solid #E4E7E8",
        boxShadow: "0 8px 20px rgba(31,32,34,0.28)",
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Section heading used across `/journal` and `/plan`. */
export function Eyebrow({ children, tone = "var(--ui-accent)" }: { children: ReactNode; tone?: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: tone, letterSpacing: "0.06em" }}>{children}</div>
  );
}

export function Card({
  children,
  padding = 16,
  style,
}: {
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1.5px solid #E4E7E8",
        borderRadius: RADIUS.card,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}


/**
 * Map control chip. Always paper-backed — the kit glyphs are green-on-ink, so a
 * filled green pill would swallow them. "On" is carried by the border, the
 * label colour and a status dot instead.
 */
export function Chip({
  is_on = false,
  tone = "var(--ui-accent)",
  onClick,
  children,
  style,
}: {
  is_on?: boolean;
  tone?: string;
  onClick: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5"
      style={{
        background: "#F9F9F9",
        border: `1.5px solid ${is_on ? tone : "#E4E7E8"}`,
        color: is_on ? tone : "#1F2022",
        borderRadius: RADIUS.pill,
        padding: "7px 12px",
        fontSize: 12,
        fontWeight: 700,
        boxShadow: "var(--shadow-card)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}


/**
 * Paper disc behind a kit glyph.
 *
 * Every icon in this kit is drawn green-on-ink for a paper ground, so dropping
 * one straight onto a filled green button makes it disappear. This gives the
 * glyph its ground back wherever the surface underneath is dark.
 */
export function GlyphDisc({ children, size = 28 }: { children: ReactNode; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: RADIUS.pill,
        background: "#F9F9F9",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </span>
  );
}
