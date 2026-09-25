import { useEffect, useMemo, useState } from "react";
import { badgeFor, type BadgeAward } from "./badge";
import { formatMeter, formatWalkMinute, type Fix, type LatLon } from "./geo";
import { isBadge, type Sighting } from "./journal";
import { species } from "./data";
import { biome_sector, sectorByCode } from "./sector";
import { displayName, kindOf } from "./kind";
import { KIND_LABEL, type Kind } from "./kind";
import { wildCollection, type WildFind } from "./collection";
import { KindThumb } from "./kind-mark";
import { SpeciesPortrait } from "./portrait.tsx";
import {
  poolFromFile,
  rankSpawn,
  RARITY_LABEL,
  RARITY_ORDER,
  REACH_RADIUS_M,
  spawnWorld,
  spawnCellKey,
  spawnWindow,
  SPAWN_WINDOW_MS,
  windowMinuteLeft,
  type Rarity,
  type Spawn,
  type SpawnPoolEntry,
} from "./spawn";
import {
  fetchWorld,
  openLiveWorld,
  readPlayer,
  syncJournal,
  syncUrl,
  toWire,
  type PlayerSummary,
  type World,
} from "./sync";
import { Card, Eyebrow, Pill, RADIUS } from "./ui";

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
  /** The pool as loaded — the wider collection shelf reads names off it. */
  pool: SpawnPoolEntry[];
  /** species_code → real campus observation count. Null where the sweep
   *  has none, so a caller cannot mistake "unrecorded" for zero. */
  pool_count: ReadonlyMap<string, number | null>;
  /** ISO instant this window closes — the countdown reads off it. */
  ends_at: string;
  is_ready: boolean;
}

const EMPTY_WORLD: SpawnWorld = {
  spawn: [],
  pool: [],
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
export function useSpawnWorld(
  explored_sector?: ReadonlySet<string>,
  at?: LatLon | null,
): SpawnWorld {
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

  const explored_key = explored_sector ? [...explored_sector].sort().join("|") : "";

  /* The near field is regenerated when the walker crosses into a new cell, not
     on every GPS frame. Rounding the position to the grid gives a memo key that
     changes exactly as often as the answer does — a walk otherwise rebuilds the
     whole world sixty times a second and the map drops frames. */
  const cell_key = at ? spawnCellKey(at) : "";

  return useMemo(() => {
    if (!pool || pool.length === 0) return EMPTY_WORLD;
    const { ends_at } = spawnWindow(now_ms);
    const explored = explored_key ? new Set(explored_key.split("|")) : undefined;
    return {
      spawn: spawnWorld(pool, now_ms, at ?? null, { explored_sector: explored }),
      pool,
      pool_count: new Map(pool.map((e) => [e.species_code, e.count])),
      ends_at,
      is_ready: true,
    };
    /* `at` is read through `cell_key`: the world may only change when the
       walker changes cell, and listing the raw position here would defeat that
       on purpose-built devices that report a new fix every 200 ms. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, now_ms, explored_key, cell_key]);
}

/* ── rarity ─────────────────────────────────────────────────────────────── */

const RARITY_TONE: Record<Rarity, { fg: string; bg: string; bd: string }> = {
  common: { fg: "rgb(var(--mg-ink-rgb) / 0.78)", bg: "rgb(var(--mg-ink-rgb) / 0.06)", bd: "rgb(var(--mg-ink-rgb) / 0.14)" },
  uncommon: { fg: "var(--mg-green-text)", bg: "rgba(62,154,74,0.12)", bd: "rgba(62,154,74,0.4)" },
  rare: { fg: "var(--mg-blue)", bg: "rgba(0,159,217,0.12)", bd: "rgba(0,159,217,0.4)" },
  mythic: { fg: "var(--mg-gold)", bg: "rgba(247,198,49,0.12)", bd: "rgba(247,198,49,0.4)" },
};

/**
 * The rarity chip. It carries a shape as well as a colour — one to four dots —
 * so it survives the same greyscale test the map pins were held to.
 */
export function RarityPill({ rarity, count }: { rarity: Rarity; count?: number | null }) {
  const tone = RARITY_TONE[rarity];
  const dot = RARITY_ORDER.indexOf(rarity) + 1;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={count === undefined || count === null ? undefined : `${count} campus observation${count === 1 ? "" : "s"} on iNaturalist`}
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
  const left = windowMinuteLeft(world.ends_at, now_ms);

  /* Empty / not-ready used to render nothing — a blank hole on home that read
     as unfinished. Same Card chrome, softer copy: inviting, not a scoreboard. */
  if (!world.is_ready || row.length === 0) {
    return (
      <Card padding={is_desktop ? 18 : 14}>
        <Eyebrow>OUT RIGHT NOW</Eyebrow>
        <div
          style={{
            marginTop: 12,
            borderRadius: RADIUS.tile,
            background: "rgb(var(--mg-ink-rgb) / 0.06)",
            border: "1.5px dashed rgb(var(--mg-ink-rgb) / 0.16)",
            padding: is_desktop ? "18px 16px" : "14px 12px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              margin: "0 auto",
              background: "rgba(62,154,74,0.12)",
              display: "grid",
              placeItems: "center",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 22,
              lineHeight: 1,
            }}
            aria-hidden
          >
            ?
          </div>
          <p style={{ fontWeight: 800, fontSize: 15, marginTop: 10, color: "#ffffff", lineHeight: 1.3 }}>
            {!world.is_ready ? "Looking for what is out right now…" : "Nothing along the path in this window."}
          </p>
          <p style={{ fontSize: 12.5, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 8, lineHeight: 1.45 }}>
            Walk. Finds rotate every 30 min.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding={is_desktop ? 18 : 14}>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>OUT RIGHT NOW</Eyebrow>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgb(var(--mg-ink-rgb) / 0.6)", fontVariantNumeric: "tabular-nums" }}>
          {left} min left
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 6, lineHeight: 1.45 }}>
        {fix ? "Nearest. Highlighted = log it." : "Rarest out now."}
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
                border: `1.5px solid ${is_reachable ? "var(--mg-green)" : "rgb(var(--mg-ink-rgb) / 0.1)"}`,
                background: is_reachable ? "rgba(62,154,74,0.12)" : "rgb(var(--mg-ink-rgb) / 0.06)",
              }}
            >
              {/* Curated artwork where we drew it; the taxon group where we did
                  not. Never the plant silhouette standing in for a bird. */}
              <SpeciesPortrait
                scientific_name={s.scientific_name}
                species_code={s.species_code}
                kind={kindOf(s.iconic_taxon_name, s.archetype)}
                size={44}
              />
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
                <div style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 3 }}>
                  {sector?.name ?? s.sector_code}
                  {/* Walk minutes are for a distance worth pacing. Printing
                      "≈1 min walk" beside "3 m" reads as filler, not help. */}
                  {distance_m !== null &&
                    ` · ${formatMeter(distance_m)}${distance_m >= 50 ? ` · ${formatWalkMinute(distance_m)}` : ""}`}
                </div>
                {/* Reachability was carried by the border colour alone, which is
                    too quiet to steer by — a rehearsal found the tap is a coin
                    flip between "camera opens" and "map moves", because the
                    walk swings finds in and out of the 40 m radius every few
                    seconds. It now says which one it is, in words. */}
                {is_reachable && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "var(--mg-green-text)",
                      marginTop: 4,
                      letterSpacing: "0.02em",
                    }}
                  >
                    You are here — tap to log it
                  </div>
                )}
              </div>
              {/* No band at all when the sweep never counted it. */}
              {s.rarity && <RarityPill rarity={s.rarity} count={world.pool_count.get(s.species_code)} />}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 10.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 10, lineHeight: 1.4 }}>
        Rarity = campus iNat count. Slots 55 / 25 / 15 / 5.
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
        border: `1.5px solid ${is_earned ? "rgba(62,154,74,0.4)" : "rgb(var(--mg-ink-rgb) / 0.1)"}`,
        background: is_earned ? "rgba(62,154,74,0.12)" : "rgb(var(--mg-ink-rgb) / 0.06)",
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
          background: is_earned ? "var(--mg-green)" : "rgb(var(--mg-ink-rgb) / 0.1)",
          color: is_earned ? "#fff" : "rgb(var(--mg-ink-rgb) / 0.5)",
          fontWeight: 800,
          fontSize: 14,
        }}
        aria-hidden
      >
        {is_earned ? "✓" : "·"}
      </div>
      <div style={{ fontWeight: 800, fontSize: 13, marginTop: 8, lineHeight: 1.2 }}>{award.def.name}</div>
      <div style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 4, lineHeight: 1.35 }}>{award.def.blurb}</div>
      {is_earned && (
        <div style={{ fontSize: 10.5, color: "var(--mg-green-text)", fontWeight: 700, marginTop: 6 }}>
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
  pool_count: ReadonlyMap<string, number | null>;
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
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mg-green-text)", fontVariantNumeric: "tabular-nums" }}>
          {earned_count} of {award.length} earned
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 6, lineHeight: 1.45 }}>
        Every badge is earned by doing the thing the app is for. Nothing is purchasable, nothing expires, and no badge
        compares you to anybody else.
      </p>
      {GROUP_ORDER.map((group) => {
        const row = award.filter((a) => a.def.group === group);
        if (row.length === 0) return null;
        return (
          <div key={group} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgb(var(--mg-ink-rgb) / 0.6)", letterSpacing: "0.06em" }}>
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

/* ── the wider collection ───────────────────────────────────────────────── */

function WildTile({ find }: { find: WildFind }) {
  return (
    <div
      title={`${find.campus_count} campus observation${find.campus_count === 1 ? "" : "s"} on iNaturalist`}
      className="flex items-center gap-3"
      style={{
        padding: 10,
        borderRadius: RADIUS.tile,
        border: "1.5px solid rgb(var(--mg-ink-rgb) / 0.1)",
        background: "rgb(var(--mg-ink-rgb) / 0.06)",
        minWidth: 0,
      }}
    >
      <KindThumb kind={find.kind} size={40} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: 13,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {find.common_name}
        </div>
        <div
          style={{
            fontStyle: "italic",
            fontSize: 10.5,
            color: "rgb(var(--mg-ink-rgb) / 0.78)",
            marginTop: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {find.scientific_name}
        </div>
        <div style={{ fontSize: 10, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 3 }}>
          {new Date(find.first_at).toLocaleDateString()}
          {find.times > 1 && ` · seen ${find.times}×`}
        </div>
      </div>
      {find.rarity && <RarityPill rarity={find.rarity} count={find.campus_count} />}
    </div>
  );
}

/**
 * Everything you have found that the guide never drew.
 *
 * The journal grid is the curated nine — a list you can set out to complete.
 * This is the other 1,073, which you can only meet by walking into them, so it
 * is a history rather than a checklist and it is ordered rarest-first.
 *
 * Renders nothing at all when you have found none. An empty "0 of 1,098" is a
 * scoreboard, and the one thing this app will not do is put a number on a
 * student that reads as a mark.
 */
export function WildShelf({
  sighting,
  pool,
  curated,
  is_desktop,
}: {
  sighting: Sighting[];
  pool: SpawnPoolEntry[];
  curated: Iterable<string>;
  is_desktop: boolean;
}) {
  const collection = useMemo(
    () => wildCollection(sighting, pool, curated),
    [sighting, pool, curated],
  );
  if (collection.found_count === 0) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>BEYOND THE GUIDE</Eyebrow>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--mg-green-text)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {collection.found_count} of {collection.pool_total.toLocaleString()} known here
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 6, lineHeight: 1.45 }}>
        Species you met by walking into them — the campus sweep knows{" "}
        {collection.pool_total.toLocaleString()} and the guide has cards for nine.
        {collection.best === "mythic" && " One of yours has been recorded here once."}
      </p>
      {collection.group.map((g) => (
        <div key={g.kind} style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgb(var(--mg-ink-rgb) / 0.6)",
              letterSpacing: "0.06em",
            }}
          >
            {KIND_LABEL[g.kind as Kind].toUpperCase()} · {g.row.length}
          </div>
          <div
            style={{
              marginTop: 8,
              display: "grid",
              gap: 8,
              gridTemplateColumns: is_desktop ? "repeat(2, minmax(0,1fr))" : "1fr",
            }}
          >
            {g.row.map((f) => (
              <WildTile key={f.species_code} find={f} />
            ))}
          </div>
        </div>
      ))}
      <p style={{ fontSize: 10.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 12, lineHeight: 1.4 }}>
        Your finds. Rarity = campus iNat count.
      </p>
    </div>
  );
}

/* ── the world ──────────────────────────────────────────────────────────── */

export function useLiveWorld(input: {
  sighting: Sighting[];
  summary: PlayerSummary;
  /** The name the campus sees — the account's when signed in (`liveNameOf`). */
  name: string;
}): { world: World | null; is_live: boolean } {
  const [world, setWorld] = useState<World | null>(null);
  const sighting_key = input.sighting.map((s) => s.sighting_id).join(",");
  const summary_key = `${input.summary.stage}:${input.summary.level}:${input.summary.total_points}:${input.summary.streak_weeks}:${input.name}`;

  useEffect(() => {
    if (!syncUrl()) return;
    let alive = true;
    const push = () => {
      const me = { ...readPlayer(), name: input.name };
      const wire = input.sighting.map((s) =>
        toWire(s, species[s.species_code]?.common_name ?? s.inat_common_name ?? s.species_code),
      );
      void syncJournal(me, wire, input.summary).then((result) => {
        if (alive && result?.world) setWorld(result.world);
      });
    };
    const stop_live = openLiveWorld((next) => {
      if (alive) setWorld(next);
    });
    push();
    const timer = setInterval(push, 20_000);
    return () => {
      alive = false;
      stop_live();
      clearInterval(timer);
    };
    // sighting_key / summary_key are the actual deps — the arrays are rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sighting_key, summary_key]);

  return { world, is_live: world !== null };
}

/**
 * Who else is out. Renders only when a sync server actually answered — with no
 * server configured this returns null rather than an empty "0 walkers" box,
 * because a zero we never measured is worse than nothing on screen.
 *
 * The walker count is `walker_label`, the hall's live count (`hallLabelOf`),
 * never the world's `walker` list: that one keeps anybody who synced in the
 * last fifteen minutes and so disagreed with the map pill.
 */
export function WorldStrip({
  sighting,
  world: given,
  walker_label = null,
  name,
}: {
  sighting: Sighting[];
  world?: World | null;
  walker_label?: string | null;
  name?: string;
}) {
  const [world, setWorld] = useState<World | null>(given ?? null);

  useEffect(() => {
    if (given) {
      setWorld(given);
      return;
    }
    if (!syncUrl()) return;
    let alive = true;
    const tick = () => {
      fetchWorld().then((w) => {
        if (alive && w) setWorld(w);
      });
    };
    tick();
    const timer = setInterval(tick, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [given]);

  if (!world) return null;
  const me_name = name ?? readPlayer().name;
  const mine = sighting.filter(isBadge).length;

  return (
    <Card padding={14}>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>THE CAMPUS RIGHT NOW</Eyebrow>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgb(var(--mg-ink-rgb) / 0.6)" }}>you are {me_name}</span>
      </div>
      <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
        {walker_label && <Pill tone="info">{walker_label}</Pill>}
        <Pill tone="neutral">{world.totals.sighting_count} finds shared</Pill>
        <Pill tone="native">{mine} of them yours</Pill>
      </div>
      <p style={{ fontSize: 10.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 10, lineHeight: 1.4 }}>
        {world.note} Your photos and notes never leave this phone — only species, count and location, which is the part
        the campus inventory does not have.
      </p>
    </Card>
  );
}
