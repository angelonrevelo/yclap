import type { ReactNode } from "react";
import type { Stage } from "./character";
import { game_icon, stage_sticker, sticker } from "./asset/kit";
import { species } from "./data";
import type { DailyTask } from "./gamify";
import { levelOf } from "./level";
import { TaxonThumb } from "./ui";
import { AccountChip } from "./account-panel.tsx";

/**
 * The game layer, in the Magisphere system (`game.css`, off the team's poster
 * set: sky, white sticker cards, wood-plank quests, Fredoka). This file decides what each piece says; every number shown is
 * one the app already has — points, the weekly streak, the daily hunt — with no
 * invented currency behind it (`level.ts`).
 */

function GameIcon({ src, size, alt = "" }: { src: string; size: number; alt?: string }) {
  return <img className="gm-ico" src={src} width={size} height={size} alt={alt} aria-hidden={alt ? undefined : true} />;
}

/**
 * The buddy as a sticker, one per growth stage. Vigor keeps its meaning from
 * `Character`: an unwalked buddy fades toward grey and walking brings the colour
 * back — the look changes, the stage never does.
 */
export function StageSticker({ stage, vigor = 1, size }: { stage: Stage; vigor?: number; size: number }) {
  const v = Math.max(0, Math.min(1, vigor));
  return (
    <img
      className="gm-ico"
      src={stage_sticker[stage]}
      width={size}
      height={size}
      alt=""
      aria-hidden
      style={{ filter: v < 1 ? `saturate(${0.35 + 0.65 * v}) brightness(${0.92 + 0.08 * v})` : undefined }}
    />
  );
}

/** Top-left player card: who you are, how far into your level, your streak. Opens the trainer sheet. */
export function PlayerHud({
  points,
  streak_weeks,
  is_week_active,
  place,
  stage,
  vigor,
  onOpen,
}: {
  points: number;
  streak_weeks: number;
  is_week_active: boolean;
  place: string;
  stage: Stage;
  vigor: number;
  onOpen: () => void;
}) {
  const lv = levelOf(points);
  return (
    <button
      type="button"
      className="gm-hud"
      onClick={onOpen}
      aria-label={`Trainer, level ${lv.level}, ${points} points, ${streak_weeks} week streak`}
    >
      <span className="gm-avatar">
        <StageSticker stage={stage} vigor={vigor} size={46} />
        <span className="gm-level">{lv.level}</span>
      </span>
      <span className="gm-hud-body">
        <span className="gm-hud-top">
          <span className="gm-place">{place}</span>
          <span className="gm-streak" data-idle={!is_week_active} title="Weekly streak">
            <GameIcon src={game_icon.streak} size={18} />
            {streak_weeks}
          </span>
        </span>
        <span className="gm-xp">
          <span className="gm-xp-fill" style={{ width: `${Math.round(lv.ratio * 100)}%` }} />
        </span>
        <span className="gm-hud-meta">
          <span>
            <b>{points}</b> pts
          </span>
          <span>
            {lv.to_next} to LV {lv.level + 1}
          </span>
          <AccountChip />
        </span>
      </span>
    </button>
  );
}

/**
 * The daily hunt as a one-line TAB: one target, where to look, what it pays.
 *
 * It used to be a three-line card 340 px wide and 64 px tall, sitting across
 * the top third of the play view. On a 375 px phone that is a banner laid over
 * the map you are meant to be reading, for a target that changes once a day.
 * The eyebrow ("DAILY HUNT") went first — a gold pill with a target icon on it
 * does not need a label saying it is a target — and the species and the sector
 * moved onto one line, where the sector truncates first because the map is
 * already showing you where you are.
 */
export function QuestBanner({
  daily,
  reward,
  onGo,
}: {
  daily: DailyTask;
  reward: number;
  onGo: () => void;
}) {
  return (
    <button type="button" className="gm-quest" data-done={daily.is_done} onClick={onGo}>
      <span className="gm-quest-target">
        {species[daily.species_code] ? (
          <TaxonThumb species_code={daily.species_code} size={28} style={{ background: "rgba(255,255,255,0.92)", border: "none" }} />
        ) : (
          <GameIcon src={game_icon.quest} size={24} />
        )}
      </span>
      <span className="gm-quest-body">
        <span className="gm-quest-name">{daily.common_name}</span>
        <span className="gm-quest-hint">
          {daily.is_done ? "cleared · back tomorrow" : `· ${daily.sector_name}`}
        </span>
      </span>
      <span className="gm-reward">
        <GameIcon src={game_icon.points} size={15} />+{reward}
      </span>
    </button>
  );
}

/**
 * The day's first open: today's hunt, presented the way the genre presents a
 * daily reward — a ribbon, one card, one button.
 *
 * It is not a login bonus, and it gives nothing for opening the app. The
 * reward on the card is the daily hunt's, already on the quest banner, and it
 * is paid only when the species is logged. This is the same task, said once
 * big enough to land, then folded back into the banner.
 */
export function TodayHuntCard({
  daily,
  reward,
  streak_weeks,
  onGo,
  onLater,
}: {
  daily: DailyTask;
  reward: number;
  streak_weeks: number;
  onGo: () => void;
  onLater: () => void;
}) {
  const is_curated = Boolean(species[daily.species_code]);
  return (
    <div className="al-scrim al-scrim-dark gm-today" role="dialog" aria-labelledby="gm-today-title">
      <div className="gm-today-ribbon" aria-hidden>
        <span>Today's hunt</span>
      </div>
      <div className="gm-today-card">
        <div className="gm-today-head">{streak_weeks > 0 ? `Week ${streak_weeks + 1} streak` : "Day one"}</div>
        <div className="gm-today-body">
          <div className="gm-today-art">
            {is_curated ? (
              <TaxonThumb species_code={daily.species_code} size={128} style={{ border: "none", background: "transparent" }} />
            ) : (
              <img src={sticker.buddy_trail} alt="" width={132} height={132} style={{ objectFit: "contain" }} />
            )}
          </div>
          <h2 id="gm-today-title" className="gm-today-name">
            {daily.common_name}
          </h2>
          <p className="gm-today-where">Out today in {daily.sector_name}</p>
          <span className="gm-today-reward">
            <GameIcon src={game_icon.points} size={18} />+{reward} when you log it
          </span>
          {/* The hunt's `challenge` event is what earns `hunt:<day>` in
              `blindbox.ts` — one box per day, opened on the Journal. */}
          <span className="gm-today-box">+ blind box, opened on your Journal</span>
        </div>
      </div>
      <button type="button" className="al-button gm-today-go" onClick={onGo}>
        Let's go
      </button>
      <button type="button" className="gm-today-later" onClick={onLater}>
        Later
      </button>
    </div>
  );
}

function DockButton({
  label,
  is_active = false,
  icon,
  onClick,
  children,
}: {
  label: string;
  is_active?: boolean;
  icon?: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button type="button" className="gm-dock-btn" data-active={is_active} aria-label={label} onClick={onClick}>
      <span className="gm-dock-face">{icon ? <GameIcon src={icon} size={32} /> : children}</span>
      <span className="gm-dock-label">{label}</span>
    </button>
  );
}

/** Buddy · Nearby · GO (raised) · Dex · About — the Magisphere leafy tab bar. */
export function GameDock({
  stage,
  vigor,
  is_journal,
  is_plan,
  is_nearby_open,
  onAvatar,
  onGo,
  onNearby,
  onDex,
  onPlan,
}: {
  stage: Stage;
  vigor: number;
  is_journal: boolean;
  is_plan: boolean;
  is_nearby_open: boolean;
  onAvatar: () => void;
  onGo: () => void;
  onNearby: () => void;
  onDex: () => void;
  onPlan: () => void;
}) {
  return (
    <nav className="gm-dock" aria-label="Game">
      <div className="gm-dock-bar">
        <DockButton label="Buddy" onClick={onAvatar}>
          <StageSticker stage={stage} vigor={vigor} size={34} />
        </DockButton>
        <DockButton label="Nearby" is_active={is_nearby_open} icon={game_icon.nearby} onClick={onNearby} />
        <button type="button" className="gm-go" aria-label="Go — log a sighting" onClick={onGo}>
          <span className="gm-go-core">
            <GameIcon src={game_icon.go} size={50} />
          </span>
          <span className="gm-go-tag">Go</span>
        </button>
        <DockButton label="Dex" is_active={is_journal} icon={game_icon.dex} onClick={onDex} />
        <DockButton label="About" is_active={is_plan} icon={game_icon.plan} onClick={onPlan} />
      </div>
    </nav>
  );
}

/**
 * Toasts that carry points pop as a reward — trophy, "+25", what earned it.
 * Anything else ("Joined Sophie") stays a plain line in the same shell.
 */
export function GameToast({ msg }: { msg: string }) {
  const hit = /\+\s?(\d+)/.exec(msg);
  const label = hit ? msg.replace(hit[0], "").replace(/\s*(pts?|points)\b/i, "").replace(/^[\s·:-]+|[\s·:-]+$/g, "") : msg;
  return (
    <div className="gm-toast" role="status">
      {hit ? (
        <span className="gm-coin" aria-hidden>
          <GameIcon src={game_icon.points} size={34} />
        </span>
      ) : (
        <span className="gm-coin" aria-hidden style={{ color: "var(--mg-green)", fontWeight: 900, fontSize: 20 }}>
          ✓
        </span>
      )}
      {hit && <span className="gm-toast-points">+{hit[1]}</span>}
      <span className="gm-toast-label">{label}</span>
    </div>
  );
}

/** Dex header: trophy, completion bar, count. */
export function DexHeader({ seen_count, total, extra }: { seen_count: number; total: number; extra: string | null }) {
  const ratio = total > 0 ? Math.min(1, seen_count / total) : 0;
  return (
    <div className="gm-dex-head">
      <span className="gm-trophy">
        <GameIcon src={game_icon.trophy} size={52} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="gm-dex-title">Dex</span>
          <span className="gm-dex-count">
            {seen_count} / {total}
            {extra ? <span style={{ marginLeft: 6, opacity: 0.6 }}>{extra}</span> : null}
          </span>
        </div>
        <div className="gm-dex-bar">
          <span className="gm-xp-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

/* The origin chip: a pale ground and dark ink, readable on a white card. */
const ORIGIN_TAG: Record<"Native" | "Exotic" | "Threatened", { bg: string; fg: string }> = {
  Native: { bg: "rgba(62,154,74,0.16)", fg: "var(--mg-green-text)" },
  Exotic: { bg: "rgba(245,200,66,0.28)", fg: "#8a5a06" },
  Threatened: { bg: "rgba(250,65,45,0.18)", fg: "var(--mg-red)" },
};

/** One collectible card. Locked cards keep their number so the set reads as a set to finish. */
export function DexCard({
  index,
  species_code,
  is_seen,
  size,
  onOpen,
}: {
  index: number;
  species_code: string;
  is_seen: boolean;
  size: number;
  /** Opens the 3D species card. Only a seen card opens — "???" stays a secret. */
  onOpen?: (species_code: string) => void;
}) {
  const sp = species[species_code];
  const origin = sp ? (sp.pill.includes("Threatened") ? "Threatened" : sp.origin) : null;
  const tag = origin ? ORIGIN_TAG[origin] : null;
  const is_openable = Boolean(onOpen && is_seen && sp);
  return (
    <div
      className="gm-card"
      data-locked={!is_seen}
      style={{ animationDelay: `${index * 35}ms`, cursor: is_openable ? "pointer" : undefined }}
      role={is_openable ? "button" : undefined}
      tabIndex={is_openable ? 0 : undefined}
      aria-label={is_openable && sp ? `Open the ${sp.common_name} card` : undefined}
      onClick={is_openable ? () => onOpen?.(species_code) : undefined}
      onKeyDown={
        is_openable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.(species_code);
              }
            }
          : undefined
      }
    >
      <span className="gm-card-no">#{String(index + 1).padStart(3, "0")}</span>
      {!is_seen && (
        <span className="gm-card-lock">
          <GameIcon src={game_icon.lock} size={20} />
        </span>
      )}
      <TaxonThumb
        species_code={species_code}
        size={size}
        is_dim={!is_seen}
        style={{ margin: "0 auto", background: is_seen ? "rgba(255,255,255,0.92)" : "rgb(var(--mg-ink-rgb) / 0.05)", border: "none" }}
      />
      {is_seen && sp ? (
        <>
          <div className="gm-card-name">{sp.common_name}</div>
          <div className="gm-card-sci">{sp.scientific_name}</div>
          {tag && origin && (
            <span className="gm-card-tag" style={{ background: tag.bg, color: tag.fg }}>
              {origin.toUpperCase()}
            </span>
          )}
        </>
      ) : (
        <div className="gm-card-unknown">???</div>
      )}
    </div>
  );
}
