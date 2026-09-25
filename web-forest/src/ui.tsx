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

export const RADIUS = { card: 10, tile: 8, pill: 999 } as const;

export interface Accent {
  /** Line and text colour. */
  ink: string;
  /** Wash behind the art. */
  wash: string;
  /** Ring around the thumbnail. */
  ring: string;
}

const ACCENT: Record<Origin | "unknown" | "threatened", Accent> = {
  Native: { ink: "var(--mg-green-text)", wash: "rgba(62,154,74,0.12)", ring: "rgba(62,154,74,0.4)" },
  Exotic: { ink: "var(--mg-gold)", wash: "rgba(247,198,49,0.12)", ring: "rgba(247,198,49,0.4)" },
  threatened: { ink: "var(--mg-red)", wash: "rgba(250,65,45,0.12)", ring: "rgba(250,65,45,0.4)" },
  unknown: { ink: "rgb(var(--mg-ink-rgb) / 0.6)", wash: "rgb(var(--mg-ink-rgb) / 0.06)", ring: "rgb(var(--mg-ink-rgb) / 0.16)" },
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
    neutral: { bg: "rgb(var(--mg-ink-rgb) / 0.08)", fg: "rgb(var(--mg-ink-rgb) / 0.92)", bd: "rgb(var(--mg-ink-rgb) / 0.1)" },
    native: { bg: "rgba(62,154,74,0.12)", fg: "var(--mg-green-text)", bd: "rgba(62,154,74,0.4)" },
    exotic: { bg: "rgba(247,198,49,0.12)", fg: "var(--mg-gold)", bd: "rgba(247,198,49,0.4)" },
    threatened: { bg: "rgba(250,65,45,0.12)", fg: "var(--mg-red)", bd: "rgba(250,65,45,0.4)" },
    info: { bg: "rgba(0,159,217,0.12)", fg: "var(--mg-blue)", bd: "rgba(0,159,217,0.4)" },
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
        background: "rgba(255,255,255,0.92)",
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
            color: "var(--mg-green-text)",
            letterSpacing: "0.07em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {eyebrow}
        </div>
      )}
      <div style={{ fontWeight: 800, fontSize: size, lineHeight: 1.15, color: "var(--mg-forest)", marginTop: eyebrow ? 3 : 0 }}>
        {sp.common_name}
      </div>
      <div style={{ fontStyle: "italic", fontSize: size * 0.72, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 1 }}>
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
        background: "rgba(255,255,255,0.92)",
        border: is_leaf ? "4px solid var(--mg-green)" : "1.5px solid rgb(var(--mg-ink-rgb) / 0.1)",
        boxShadow: "var(--mg-shadow-sm)",
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Section heading used across `/journal` and `/plan`. */
export function Eyebrow({ children, tone = "var(--mg-green)" }: { children: ReactNode; tone?: string }) {
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
        background: "var(--mg-surface)",
        color: "rgb(var(--mg-ink-rgb) / 0.92)",
        border: "1px solid rgb(var(--mg-ink-rgb) / 0.1)",
        borderRadius: RADIUS.card,
        boxShadow: "var(--mg-shadow-sm)",
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
  tone = "var(--mg-green)",
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
        background: "var(--mg-surface-glass)",
        border: `1.5px solid ${is_on ? tone : "rgb(var(--mg-ink-rgb) / 0.1)"}`,
        color: is_on ? tone : "rgb(var(--mg-ink-rgb) / 0.92)",
        borderRadius: RADIUS.pill,
        padding: "7px 12px",
        fontSize: 12,
        fontWeight: 700,
        boxShadow: "var(--mg-shadow-sm)",
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
        background: "rgba(255,255,255,0.92)",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </span>
  );
}

/**
 * A sheet's close: a real 44×44 target with an ×. The 42×5 grab bar it sits
 * beside was the only way out of three sheets, and a bar that thin is a hint,
 * not a button.
 */
export function SheetClose({
  onClose,
  label = "Close",
  style,
}: {
  onClose: () => void;
  label?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="mg-sheet-close"
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        color: "rgb(var(--mg-ink-rgb) / 0.78)",
        background: "var(--mg-surface-2)",
        flexShrink: 0,
        ...style,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M4 4 L14 14 M14 4 L4 14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}
