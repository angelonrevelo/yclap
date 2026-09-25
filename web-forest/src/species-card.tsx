/**
 * The 3D species card — one sheet for one species, with its model turning.
 *
 * The 1,098-model species pack (`public/model/species/*.glb`, indexed by
 * `species-model.json`) is rendered here through the same self-hosted
 * `<model-viewer>` the character uses. This module is lazy-loaded from
 * `app.tsx`, so the viewer and this sheet cost nothing until a card is opened.
 *
 * The pack is NOT precached by the service worker (80 MB would blow the device
 * budget), so offline a model that has not loaded is not attempted: the card
 * falls back to the portrait (photo, then the kit drawing, then the kind mark)
 * and says "3D needs a connection" — see `chooseVisual`.
 *
 * Opening the card is a Learn. The award itself is made by the caller through
 * the app's one award path, under `learnSubject`, so it is paid once per
 * species however many surfaces open it.
 */
import "@google/model-viewer";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SEEK_URL, species } from "./data";
import { RarityPill } from "./live";
import { SpeciesPortrait } from "./portrait";
import type { SpawnPoolEntry } from "./spawn";
import { cardFact, chooseVisual, type ModelState } from "./species-card-core";
import { Pill, SheetClose } from "./ui";

export interface SpeciesCardAction {
  label: string;
  onClick: () => void;
}

interface Props {
  species_code: string;
  pool: SpawnPoolEntry[];
  is_seen: boolean;
  /** The curated back of the card (attribute tiles, habitat), when there is one. */
  learn?: ReactNode;
  /** One primary action — "Walk to it" from Nearby, for instance. */
  action?: SpeciesCardAction | null;
  onClose: () => void;
}

function useOnline(): boolean {
  const [is_online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return is_online;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * The turning model with its portrait stand-in and the line under it. Shared
 * by the card and the map's pin sheet, so a pin opens on the same 3D species
 * the card shows rather than a flat drawing.
 */
export function SpeciesHero({
  species_code,
  pool,
  height = 240,
}: {
  species_code: string;
  pool: SpawnPoolEntry[];
  height?: number;
}) {
  const curated = species[species_code];
  const entry = pool.find((e) => e.species_code === species_code);
  const fact = cardFact(species_code, curated, entry);
  const is_online = useOnline();
  const [model_state, setModelState] = useState<ModelState>("loading");
  const viewer_ref = useRef<HTMLElement | null>(null);
  const is_reduced = prefersReducedMotion();
  const choice = chooseVisual({ model_path: fact.model_path, is_online, model_state });
  const is_model = choice.visual === "model" && fact.model_path !== null;

  /* One hero per species: callers key this by species_code, so `model_state`
     starts fresh for each species without a reset effect. */

  useEffect(() => {
    const el = viewer_ref.current;
    if (!el || !is_model) return;
    const onLoad = () => setModelState("loaded");
    const onError = () => setModelState("error");
    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
    };
  }, [is_model, fact.model_path]);

  const portrait_size = Math.round(Math.min(160, height * 0.66));
  const portrait = (size: number) => (
    <SpeciesPortrait
      scientific_name={fact.scientific_name}
      species_code={fact.is_curated ? species_code : undefined}
      kind={fact.kind}
      size={size}
    />
  );

  /* Motion is opt-out: no turntable and no idle clip under reduced motion. The
     model still loads and can be turned by hand. */
  const motion = is_reduced ? {} : { "auto-rotate": true, autoplay: true };

  return (
    <>
      <div
        style={{
          height,
          borderRadius: 14,
          background: "linear-gradient(180deg, rgba(62,154,74,0.10), rgba(62,154,74,0.02))",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        {is_model ? (
          <model-viewer
            key={fact.model_path}
            ref={viewer_ref}
            src={fact.model_path!}
            alt={`A 3D model of ${fact.common_name}`}
            camera-controls
            interaction-prompt="none"
            loading="eager"
            shadow-intensity="1"
            shadow-softness="0.8"
            {...motion}
            style={{ width: "100%", height: "100%", "--poster-color": "transparent" } as CSSProperties}
          >
            {/* Shown until the model is in: the same portrait the fallback uses. */}
            <div slot="poster" style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
              {portrait(portrait_size - 10)}
            </div>
          </model-viewer>
        ) : (
          portrait(portrait_size)
        )}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, textAlign: "center", marginTop: 6, color: "rgb(var(--mg-ink-rgb) / 0.6)", minHeight: 14 }}>
        {choice.note ?? (model_state === "loaded" ? "Drag to turn it" : "Loading the 3D model…")}
      </div>
    </>
  );
}

export default function SpeciesCard({ species_code, pool, is_seen, learn, action, onClose }: Props) {
  const curated = species[species_code];
  const entry = pool.find((e) => e.species_code === species_code);
  const fact = cardFact(species_code, curated, entry);
  const is_reduced = prefersReducedMotion();

  /* Escape is handled once, in app.tsx, for every sheet — so it closes the
     top one only. */

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 60, background: "rgba(8,20,12,0.42)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={fact.common_name}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "min(820px, 92vh)",
          overflowY: "auto",
          background: "var(--mg-surface)",
          color: "rgb(var(--mg-ink-rgb) / 0.92)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: "var(--mg-shadow-up)",
          padding: "0 22px 28px",
          animation: is_reduced ? undefined : "fgup .3s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        {/* Sticky: the close stays in reach however far the card is scrolled. */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            margin: "0 -22px",
            padding: "6px 10px 4px",
            background: "var(--mg-surface)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <span
            aria-hidden="true"
            style={{ position: "absolute", left: "50%", top: 10, width: 42, height: 5, marginLeft: -21, borderRadius: 999, background: "rgb(var(--mg-ink-rgb) / 0.28)" }}
          />
          <SheetClose onClose={onClose} />
        </div>

        <SpeciesHero species_code={species_code} pool={pool} />

        <div style={{ textAlign: "center", marginTop: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{fact.common_name}</div>
          {fact.scientific_name && (
            <div style={{ fontStyle: "italic", fontSize: 14, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 4 }}>{fact.scientific_name}</div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 }}>
            <Pill>{fact.kind_label}</Pill>
            {fact.rarity ? <RarityPill rarity={fact.rarity} count={fact.campus_count} /> : <Pill>No campus record</Pill>}
            {fact.origin && <Pill tone={fact.origin === "Native" ? "native" : fact.origin === "Exotic" ? "exotic" : "neutral"}>{fact.origin}</Pill>}
            <Pill tone={is_seen ? "native" : "neutral"}>{is_seen ? "In your journal" : "Not in your journal yet"}</Pill>
          </div>
          {fact.campus_count !== null && (
            <div style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 8 }}>
              {fact.campus_count} campus observation{fact.campus_count === 1 ? "" : "s"} on iNaturalist (2026-09-03 sweep)
            </div>
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          {curated ? (
            <>
              <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0 }}>{curated.note}</p>
              {curated.caption && (
                <div style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 10, lineHeight: 1.4 }}>{curated.caption}</div>
              )}
              {learn}
            </>
          ) : (
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: "rgb(var(--mg-ink-rgb) / 0.78)" }}>
              Recorded on campus by iNaturalist observers. The guide has no write-up for this one yet.
            </p>
          )}
        </div>

        {action && (
          <button
            onClick={action.onClick}
            className="mg-btn-primary"
            style={{ width: "100%", height: 50, borderRadius: 10, fontWeight: 800, fontSize: 16, marginTop: 18 }}
          >
            {action.label}
          </button>
        )}
        <a
          href={SEEK_URL}
          target="_blank"
          rel="noreferrer"
          className="mg-btn-secondary"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: 46,
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 14,
            marginTop: 10,
            textDecoration: "none",
          }}
        >
          Open in Seek
        </a>
        <p style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 8, textAlign: "center" }}>
          Identification stays with iNaturalist — not this app.
        </p>
      </div>
    </div>
  );
}
