import { useEffect, useMemo, useState } from "react";
import { badgeFor, type BadgeAward } from "./badge";
import { formatMeter, formatWalkMinute, type Fix } from "./geo";
import { isBadge, type Sighting } from "./journal";
import { species } from "./data";
import { biome_sector, sectorByCode } from "./sector";
import { displayName, kindOf } from "./kind";
import { KindThumb } from "./kind-mark";
import {
  poolFromFile,
  rankSpawn,
  RARITY_LABEL,
  RARITY_ORDER,
  REACH_RADIUS_M,
  spawnForWindow,
  spawnWindow,
  SPAWN_WINDOW_MS,
  windowMinuteLeft,
  type Rarity,
  type Spawn,
  type SpawnPoolEntry,
} from "./spawn";
import { fetchWorld, readPlayer, syncUrl, type World } from "./sync";
import { Card, Eyebrow, Pill, RADIUS, TaxonThumb } from "./ui";

export { rankSpawn, reachableSpawn, REACH_RADIUS_M } from "./spawn";

/**
 * The live layer — the surfaces for the three modules that shipped with tests
 * and no screen: `spawn.ts`, `badge.ts` and `sync.ts`.
 *
 * A rule the whole file follows: **nothing here invents a fact.** Rarity is the
 * species' real iNaturalist campus count, distance is measured off the fix,
 * the badge state is a pure function of this device's journal, and the world
 * strip renders only when a sync server actually answered. Where a number is
 * ours rather than measured, the surface says so on screen.
 *
 * It lives outside `app.tsx` on purpose. That file is already 3,300 lines, and
 * a feature whose whole job is to be swapped in and out before a showcase
 * should not be threaded through it.
 */

/* ── the pool ───────────────────────────────────────────────────────────────
 * `public/model/species-model.json` is 422 kB of real sweep data. It is
 * FETCHED, never imported: bundling it would put a fifth of a megabyte into
 * the app chunk for a screen the student may never open. One module-level
 * promise, so eight components asking for it cost one request.
 */

let pool_promise: Promise<SpawnPoolEntry[]> | null = null;

export function loadSpawnPool(): Promise<SpawnPoolEntry[]> {
  if (!pool_promise) {
    pool_promise = fetch("/model/species-model.json")
      .then((r) => (r.ok ? r.json() : { model: [] }))
      .then((json) => poolFromFile(json as { model: unknown }))
      .catch(() => []);
  }
  return pool_promise;
}

export interface SpawnWorld {
  spawn: Spawn[];
  /** species_code → real campus observation count, for the rarity badges. */
  pool_count: ReadonlyMap<string, number>;
  /** ISO instant this window closes — the countdown reads off it. */
  ends_at: string;
  is_ready: boolean;
}

const EMPTY_WORLD: SpawnWorld = {
  spawn: [],
  pool_count: new Map(),
  ends_at: new Date(0).toISOString(),
  is_ready: false,
};

/**
 * The world for the window we are in, recomputed when that window rolls.
 *
 * The timer is set to the window's own end, not to a poll interval: a 30-minute
 * `setInterval` that starts when the component mounts drifts out of phase with
 * everyone else's world, and the whole point of a seeded window is that two
 * phones standing next to each other see the same finds.
 */
export function useSpawnWorld(): SpawnWorld {
  const [pool, setPool] = useState<SpawnPoolEntry[] | null>(null);
  const [now_ms, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    loadSpawnPool().then((row) => {
      if (alive) setPool(row);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const { index } = spawnWindow(now_ms);
    const ends_ms = (index + 1) * SPAWN_WINDOW_MS;
    /* +250 ms so the wake lands inside the next window, never on its boundary. */
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1000, ends_ms - Date.now() + 250));
    return () => clearTimeout(timer);
  }, [now_ms]);

  return useMemo(() => {
    if (!pool || pool.length === 0) return EMPTY_WORLD;
    const { ends_at } = spawnWindow(now_ms);
    return {
      spawn: spawnForWindow(pool, now_ms),
      pool_count: new Map(pool.map((e) => [e.species_code, e.count])),
      ends_at,
      is_ready: true,
    };
  }, [pool, now_ms]);
}

/* ── rarity ─────────────────────────────────────────────────────────────── */

const RARITY_TONE: Record<Rarity, { fg: string; bg: string; bd: string }> = {
  common: { fg: "#4a5a4e", bg: "rgba(31,32,34,0.05)", bd: "rgba(31,32,34,0.16)" },
  uncommon: { fg: "#008653", bg: "rgba(0,134,83,0.1)", bd: "rgba(0,134,83,0.3)" },
  rare: { fg: "#075D89", bg: "rgba(5,140,214,0.1)", bd: "rgba(5,140,214,0.32)" },
  mythic: { fg: "#8a5d00", bg: "rgba(246,178,45,0.18)", bd: "rgba(246,178,45,0.55)" },
};

/**
 * The rarity chip. It carries a shape as well as a colour — one to four dots —
 * so it survives the same greyscale test the map pins were held to.
 */
export function RarityPill({ rarity, count }: { rarity: Rarity; count?: number }) {
  const tone = RARITY_TONE[rarity];
  const dot = RARITY_ORDER.indexOf(rarity) + 1;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={count === undefined ? undefined : `${count} campus observation${count === 1 ? "" : "s"} on iNaturalist`}
      style={{
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.bd}`,
        borderRadius: RADIUS.pill,
        fontWeight: 700,
        fontSize: 11,
        lineHeight: 1,
        padding: "6px 10px",
        whiteSpace: "nowrap",
      }}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: dot }, (_, i) => (
          <span key={i} style={{ width: 4, height: 4, borderRadius: 999, background: tone.fg }} />
        ))}
      </span>
      {RARITY_LABEL[rarity]}
    </span>
  );
}

/* ── what is out right now ──────────────────────────────────────────────── */

export function SpawnStrip({
  world,
  fix,
  seen_species,
  onPick,
  limit = 4,
  is_desktop = false,
}: {
  world: SpawnWorld;
  fix: Fix | null | undefined;
  seen_species: Set<string>;
  onPick: (row: Spawn) => void;
  limit?: number;
  is_desktop?: boolean;
}) {
  const now_ms = Date.now();
  const row = useMemo(() => rankSpawn(world.spawn, fix ?? null, limit), [world.spawn, fix, limit]);
  if (!world.is_ready || row.length === 0) return null;
  const left = windowMinuteLeft(world.ends_at, now_ms);

  return (
    <Card padding={is_desktop ? 18 : 14}>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>OUT RIGHT NOW</Eyebrow>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(31,32,34,0.5)", fontVariantNumeric: "tabular-nums" }}>
          {left} min left
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: "rgba(31,32,34,0.55)", marginTop: 6, lineHeight: 1.45 }}>
        {fix
          ? "Nearest to you. The world rotates every 30 minutes and every phone on campus sees the same one."
          : "Rarest out this window — turn on location and this becomes what is nearest to you."}
      </p>
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {row.map(({ row: s, distance_m }) => {
          const sp = species[s.species_code];
          const sector = sectorByCode(s.sector_code);
          const is_logged = seen_species.has(s.species_code);
          const is_reachable = distance_m !== null && distance_m <= REACH_RADIUS_M;
          return (
            <button
              key={s.spawn_id}
              onClick={() => onPick(s)}
              className="flex items-center gap-3"
              style={{
                textAlign: "left",
                width: "100%",
                padding: 10,
                borderRadius: RADIUS.tile,
                border: `1.5px solid ${is_reachable ? "#008653" : "#E4E7E8"}`,
                background: is_reachable ? "rgba(0,134,83,0.05)" : "#fff",
              }}
            >
              {/* Curated artwork where we drew it; the taxon group where we did
                  not. Never the plant silhouette standing in for a bird. */}
              {sp ? (
                /* Not dimmed. The dim state means "not in your collection",
                   which is the journal grid's job; this strip is about what is
                   out there, and the "In journal" pill already says which. */
                <TaxonThumb species_code={s.species_code} size={44} />
              ) : (
                <KindThumb kind={kindOf(s.iconic_taxon_name, s.archetype)} size={44} />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: 14,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {sp?.common_name ?? displayName(s.common_name)}
                  </span>
                  {is_logged && <Pill tone="native">In journal</Pill>}
                </div>
                <div style={{ fontSize: 11.5, color: "rgba(31,32,34,0.6)", marginTop: 3 }}>
                  {sector?.name ?? s.sector_code}
                  {/* Walk minutes are for a distance worth pacing. Printing
                      "≈1 min walk" beside "3 m" reads as filler, not help. */}
                  {distance_m !== null &&
                    ` · ${formatMeter(distance_m)}${distance_m >= 50 ? ` · ${formatWalkMinute(distance_m)}` : ""}`}
                </div>
              </div>
              <RarityPill rarity={s.rarity} count={world.pool_count.get(s.species_code)} />
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 10.5, color: "rgba(31,32,34,0.45)", marginTop: 10, lineHeight: 1.4 }}>
        Rarity is the species&rsquo; real iNaturalist observation count inside the campus box (2026-09-03 sweep), not a
        difficulty we invented. How often each band appears is ours: 55 / 25 / 15 / 5.
      </p>
    </Card>
  );
}

/* ── the badge shelf ────────────────────────────────────────────────────── */

const GROUP_LABEL: Record<string, string> = {
  find: "Finding",
  explore: "Walking",
  time: "Being out",
  science: "Contributing",
};

const GROUP_ORDER = ["find", "explore", "time", "science"];

function BadgeTile({ award }: { award: BadgeAward }) {
  const is_earned = award.earned_at !== null;
  return (
    <div
      title={award.def.blurb}
      style={{
        padding: 12,
        borderRadius: RADIUS.tile,
        border: `1.5px solid ${is_earned ? "rgba(0,134,83,0.35)" : "#E4E7E8"}`,
        background: is_earned ? "rgba(0,134,83,0.06)" : "#fff",
        opacity: is_earned ? 1 : 0.72,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          background: is_earned ? "#008653" : "rgba(31,32,34,0.08)",
          color: is_earned ? "#fff" : "rgba(31,32,34,0.4)",
          fontWeight: 800,
          fontSize: 14,
        }}
        aria-hidden
      >
        {is_earned ? "✓" : "·"}
      </div>
      <div style={{ fontWeight: 800, fontSize: 13, marginTop: 8, lineHeight: 1.2 }}>{award.def.name}</div>
      <div style={{ fontSize: 11, color: "rgba(31,32,34,0.6)", marginTop: 4, lineHeight: 1.35 }}>{award.def.blurb}</div>
      {is_earned && (
        <div style={{ fontSize: 10.5, color: "#008653", fontWeight: 700, marginTop: 6 }}>
          Earned {new Date(award.earned_at as string).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

export function BadgeShelf({
  sighting,
  pool_count,
  is_desktop,
}: {
  sighting: Sighting[];
  pool_count: ReadonlyMap<string, number>;
  is_desktop: boolean;
}) {
  const award = useMemo(
    () => badgeFor(sighting, { pool_count, sector_total: biome_sector.length }),
    [sighting, pool_count],
  );
  const earned_count = award.filter((a) => a.earned_at !== null).length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>YOUR BADGES</Eyebrow>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#008653", fontVariantNumeric: "tabular-nums" }}>
          {earned_count} of {award.length} earned
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: "rgba(31,32,34,0.55)", marginTop: 6, lineHeight: 1.45 }}>
        Every badge is earned by doing the thing the app is for. Nothing is purchasable, nothing expires, and no badge
        compares you to anybody else.
      </p>
      {GROUP_ORDER.map((group) => {
        const row = award.filter((a) => a.def.group === group);
        if (row.length === 0) return null;
        return (
          <div key={group} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(31,32,34,0.5)", letterSpacing: "0.06em" }}>
              {(GROUP_LABEL[group] ?? group).toUpperCase()}
            </div>
            <div
              style={{
                marginTop: 8,
                display: "grid",
                gap: 8,
                gridTemplateColumns: is_desktop ? "repeat(3, minmax(0,1fr))" : "repeat(2, minmax(0,1fr))",
              }}
            >
              {row.map((a) => (
                <BadgeTile key={a.def.id} award={a} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── the world ──────────────────────────────────────────────────────────── */

/**
 * Who else is out. Renders only when a sync server actually answered — with no
 * server configured this returns null rather than an empty "0 walkers" box,
 * because a zero we never measured is worse than nothing on screen.
 *
 * There is no rank in here and there is no field to build one from: the wire
 * carries a name, a stage and a level, and the strip prints the first two.
 */
export function WorldStrip({ sighting }: { sighting: Sighting[] }) {
  const [world, setWorld] = useState<World | null>(null);

  useEffect(() => {
    if (!syncUrl()) return;
    let alive = true;
    const tick = () => {
      fetchWorld().then((w) => {
        if (alive && w) setWorld(w);
      });
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!world) return null;
  const me = readPlayer();
  const other = world.walker.filter((w) => w.player_id !== me.player_id);
  const mine = sighting.filter(isBadge).length;

  return (
    <Card padding={14}>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>THE CAMPUS RIGHT NOW</Eyebrow>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(31,32,34,0.5)" }}>you are {me.name}</span>
      </div>
      <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
        <Pill tone="info">{other.length} other walker{other.length === 1 ? "" : "s"} out</Pill>
        <Pill tone="neutral">{world.totals.sighting_count} finds shared</Pill>
        <Pill tone="native">{mine} of them yours</Pill>
      </div>
      <p style={{ fontSize: 10.5, color: "rgba(31,32,34,0.45)", marginTop: 10, lineHeight: 1.4 }}>
        {world.note} Your photos and notes never leave this phone — only species, count and location, which is the part
        the campus inventory does not have.
      </p>
    </Card>
  );
}
