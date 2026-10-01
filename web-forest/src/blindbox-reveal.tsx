import { useEffect, useMemo, useState } from "react";
import { OUTFIT_EVENT, readOutfit, wearById, writeOutfit } from "./wear";
import {
  charmShelf,
  earnedBox,
  openBox,
  readBoxOpen,
  unopenedBox,
  writeBoxOpen,
  type BoxCosmetic,
  type BoxOpen,
  type CharmGlyph,
  type OpenResult,
} from "./blindbox.ts";
import { readPointEvents } from "./gamify.ts";
import { haptic } from "./haptic.ts";
import { Card, Eyebrow } from "./ui";

/**
 * The Journal's blind-box shelf and its reveal.
 *
 * Reads the points ledger and the opened-box list straight from storage, so the
 * Journal needs one line to host it. `refresh_key` is anything that changes
 * when a point is awarded (the total works) — a new award may mean a new box.
 *
 * The reveal reuses the stage reveal's keyframes (`index.css`, T4.5): shake →
 * crack → burst → the charm scales in. Under `prefers-reduced-motion` the box
 * is skipped and the charm appears at once.
 */
export function BlindboxShelf({ refresh_key }: { refresh_key?: unknown }) {
  const [open, setOpen] = useState<BoxOpen[]>(() => readBoxOpen());
  const [event, setEvent] = useState(() => readPointEvents());
  const [reveal, setReveal] = useState<OpenResult | null>(null);

  useEffect(() => {
    setEvent(readPointEvents());
    setOpen(readBoxOpen());
  }, [refresh_key]);

  const earned = useMemo(() => earnedBox(event), [event]);
  const waiting = useMemo(() => unopenedBox(earned, open), [earned, open]);
  const shelf = useMemo(() => charmShelf(open), [open]);
  const found_count = shelf.filter((c) => c.count > 0).length;

  const openNext = () => {
    const next = waiting[0];
    if (!next) return;
    const result = openBox(next.box_id, earned, open);
    if (!result) return;
    /* Saved now, so a reload mid-reveal cannot lose the charm; the shelf only
       updates on dismiss, so it does not spoil the box behind the overlay. */
    writeBoxOpen(result.open);
    setReveal(result);
    haptic("success");
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>BLIND BOXES</Eyebrow>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgb(var(--mg-ink-rgb) / 0.7)" }}>
          {found_count}/{shelf.length} charms
        </span>
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
        <BoxGlyph size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            {waiting.length === 0 ? "No box waiting" : waiting.length === 1 ? "1 box to open" : `${waiting.length} boxes to open`}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.4, color: "rgb(var(--mg-ink-rgb) / 0.75)" }}>
            {waiting[0]
              ? waiting[0].source === "hunt"
                ? "Earned for finishing a daily hunt."
                : "Earned for a species new to this journal."
              : "Log a new species or finish the daily hunt to earn one."}
          </div>
        </div>
        <button
          type="button"
          onClick={openNext}
          disabled={waiting.length === 0}
          /* The alert pill (`boot.css`), sized down to sit in the row: its own
             26 px top margin and 210 px minimum are for a centred card. */
          className="al-button"
          style={{
            flexShrink: 0,
            marginTop: 0,
            minWidth: 0,
            height: 44,
            padding: "0 20px",
            fontSize: 14,
            opacity: waiting.length === 0 ? 0.45 : 1,
            cursor: waiting.length === 0 ? "default" : "pointer",
          }}
        >
          Open
        </button>
      </div>
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 14 }}
        aria-label="Charm collection"
      >
        {shelf.map(({ cosmetic, count }) => (
          <div key={cosmetic.id} style={{ textAlign: "center", opacity: count > 0 ? 1 : 0.35 }}>
            <CharmGlyphMark cosmetic={cosmetic} size={40} is_hidden={count === 0} />
            <div style={{ fontSize: 10.5, lineHeight: 1.2, marginTop: 4, fontWeight: 600 }}>
              {count > 0 ? cosmetic.name : "?"}
              {count > 1 && <span style={{ color: "var(--mg-gold)" }}> ×{count}</span>}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, lineHeight: 1.4, marginTop: 12, color: "rgb(var(--mg-ink-rgb) / 0.7)" }}>
        Earned, never bought. Cosmetic only, on this device. No odds: every charm comes out once before any repeats.
      </p>
      {reveal && (
        <BlindboxReveal
          result={reveal}
          onDismiss={() => {
            setOpen(reveal.open);
            setReveal(null);
            /* A new charm goes on at once if its slot is free — you see it on
               the walker straight away (`wear.ts`, `character-model.tsx`). */
            const item = wearById(reveal.cosmetic.id);
            const outfit = readOutfit();
            if (item && reveal.is_new && !outfit[item.slot]) {
              writeOutfit({ ...outfit, [item.slot]: item.wear_id });
              window.dispatchEvent(new Event(OUTFIT_EVENT));
            }
          }}
        />
      )}
    </Card>
  );
}

function BlindboxReveal({ result, onDismiss }: { result: OpenResult; onDismiss: () => void }) {
  const prefers_reduced = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false),
    [],
  );
  const [phase, setPhase] = useState<"shake" | "crack" | "burst" | "done">(prefers_reduced ? "done" : "shake");

  useEffect(() => {
    if (prefers_reduced) return;
    const timer = [
      window.setTimeout(() => setPhase("crack"), 900),
      window.setTimeout(() => setPhase("burst"), 1400),
      window.setTimeout(() => setPhase("done"), 1850),
    ];
    return () => timer.forEach(clearTimeout);
  }, [prefers_reduced]);

  return (
    /* The shared alert chrome (`boot.css`): the same blurred dark scrim and
       pill button as the weather, safety and daily-hunt cards. */
    <div role="dialog" aria-label="Blind box" className="al-scrim al-scrim-dark" onClick={onDismiss}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", textAlign: "center" }}>
        {phase !== "done" && (
          <div
            className={phase === "burst" ? "yc-burst-out" : "yc-box-shake"}
            style={{
              animation: phase === "burst" ? "yc-burst 0.45s ease-out forwards" : "yc-box-shake 0.8s ease-in-out infinite",
              position: "relative",
            }}
          >
            <BoxGlyph size={140} is_cracked={phase !== "shake"} />
          </div>
        )}
        {phase === "done" && (
          <div
            className={prefers_reduced ? "al-card al-light" : "al-card al-light yc-reveal-in"}
            style={{
              /* The charm's own scale-in replaces the card's bounce. */
              animation: prefers_reduced ? "none" : "yc-reveal-in 0.6s ease-out forwards",
              width: "min(100%, 320px)",
              gap: 8,
              padding: "26px 26px 24px",
            }}
          >
            <CharmGlyphMark cosmetic={result.cosmetic} size={96} />
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: result.is_new ? "var(--mg-green)" : "var(--mg-gold)" }}>
              {result.is_new ? "NEW CHARM" : "ANOTHER ONE"}
            </div>
            <div className="mg-heading" style={{ fontWeight: 800, fontSize: 20, color: "rgb(var(--mg-ink-rgb) / 0.92)" }}>
              {result.cosmetic.name}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.4, color: "rgb(var(--mg-ink-rgb) / 0.78)" }}>{result.cosmetic.blurb}</div>
            <button type="button" onClick={onDismiss} className="al-button" style={{ marginTop: 12 }}>
              Keep it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The box itself: a kraft cube with a leaf seal and a ribbon. */
function BoxGlyph({ size, is_cracked = false }: { size: number; is_cracked?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <rect x="14" y="30" width="72" height="60" rx="10" fill="#EBDCBB" stroke="#C9B489" strokeWidth="3" />
      <rect x="10" y="22" width="80" height="18" rx="6" fill="#FDF6E3" stroke="#C9B489" strokeWidth="3" />
      <rect x="45" y="22" width="10" height="68" fill="#5B8C3E" />
      <circle cx="50" cy="56" r="10" fill="#FDF6E3" stroke="#5B8C3E" strokeWidth="3" />
      <path d="M46 58 Q50 48 55 53 Q52 60 46 58 Z" fill="#5B8C3E" />
      {is_cracked && (
        <path
          d="M22 40 L30 56 L24 70 L34 86"
          stroke="#7A5433"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          className="yc-crack-line"
          style={{ strokeDasharray: 50, animation: "yc-crack 0.5s ease-out forwards" }}
        />
      )}
    </svg>
  );
}

const GLYPH_PATH: Record<CharmGlyph, string> = {
  leaf: "M50 18 C74 28 78 58 50 82 C22 58 26 28 50 18 Z M50 26 L50 76",
  feather: "M64 16 C40 30 30 56 36 84 L42 78 C46 58 54 40 64 16 Z M36 84 L30 90",
  /* Drawn as five circles below; the path is only the stem. */
  flower: "M50 62 L50 86",
  drop: "M50 16 C62 36 72 50 72 62 a22 22 0 0 1 -44 0 C28 50 38 36 50 16 Z",
  star: "M50 16 L58 40 L84 42 L63 58 L71 84 L50 69 L29 84 L37 58 L16 42 L42 40 Z",
};

function CharmGlyphMark({ cosmetic, size, is_hidden = false }: { cosmetic: BoxCosmetic; size: number; is_hidden?: boolean }) {
  const fill = is_hidden ? "rgb(var(--mg-ink-rgb) / 0.25)" : cosmetic.accent;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: "inline-block" }}>
      <circle cx="50" cy="50" r="46" fill="#FFFFFF" stroke={is_hidden ? "rgb(var(--mg-ink-rgb) / 0.2)" : cosmetic.accent} strokeWidth="4" />
      <path d={GLYPH_PATH[cosmetic.glyph]} fill={fill} stroke="rgb(var(--mg-ink-rgb) / 0.55)" strokeWidth="2.5" strokeLinejoin="round" />
      {cosmetic.glyph === "flower" && (
        <>
          {[0, 72, 144, 216, 288].map((deg) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            return (
              <circle
                key={deg}
                cx={50 + Math.cos(rad) * 16}
                cy={46 + Math.sin(rad) * 16}
                r="11"
                fill={fill}
                stroke="rgb(var(--mg-ink-rgb) / 0.55)"
                strokeWidth="2.5"
              />
            );
          })}
          <circle cx="50" cy="46" r="8" fill={is_hidden ? fill : "#F6B22D"} />
        </>
      )}
    </svg>
  );
}
