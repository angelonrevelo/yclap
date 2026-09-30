import { useState, type ReactNode } from "react";
import { RADIUS } from "./ui";
import { sticker } from "./asset/kit";
import {
  ESSAY,
  LIMIT,
  PARTNER,
  STAGE_LADDER,
  STAGE_NOW,
} from "./settings-content";
import type { Preference } from "./preference";
import AccountPanel from "./account-panel.tsx";
import { unmuteAll } from "./mute";
import { ReportForm, useMuted } from "./report-sheet";

/**
 * Settings — what this is, how far along it is, and who it is talking to.
 *
 * It replaces the Plan tab and carries Plan's brief forward: the Working Doc's
 * four-tab structure gives PLAN "from data to action — what happens after the
 * walk, who we work with, how to get involved", and every one of those is a
 * panel below. What is added is the question a student at a booth asks first,
 * which the plan document never answered: *what IS this, and can I trust it
 * yet?*
 *
 * ## Why it is tabbed tables and not one long page
 *
 * The first cut was a single column of prose cards — essay, then account, then
 * preferences, then the ladder, then six offices — and it ran to roughly five
 * screens on a phone. That shape has two faults. Somebody looking for one fact
 * ("is this official?", "who have you asked?") has to scroll past four things
 * they did not want, and nothing on the page can be COMPARED, because the rows
 * that belong in a column are separated by paragraphs.
 *
 * So: five panels, one on screen at a time, and inside each the content is a
 * real `<table>` wherever it is genuinely tabular. Six offices against one
 * status column is a table. Four stages against what changes at each is a
 * table. That is not decoration — a reader scanning "which of these have
 * agreed" is doing a column scan, and a column is the shape that supports it.
 *
 * ## The rule the content follows
 *
 * This is the surface most able to overclaim, so it claims least. The stage
 * says ALPHA and spells out what alpha costs you. Every office reads NOT YET,
 * because the Working Doc's first objective forbids the other version:
 * *"Record who answered and who did not. Do not claim '20 representatives
 * consulted' until that number is real."* `settings.test.ts` holds that line.
 * And the limits sit in the same panel as the pitch, not a tap away from it.
 */

const TONE = {
  panel: "var(--mg-bg)",
  card: "var(--mg-surface)",
  edge: "rgb(var(--mg-ink-rgb) / 0.09)",
  rule: "rgb(var(--mg-ink-rgb) / 0.07)",
  text: "rgb(var(--mg-ink-rgb) / 0.92)",
  dim: "rgb(var(--mg-ink-rgb) / 0.62)",
  faint: "rgb(var(--mg-ink-rgb) / 0.5)",
  green: "var(--mg-green)",
  green_soft: "rgba(62,154,74,0.12)",
  gold: "var(--mg-gold)",
};

export interface SettingsIcon {
  account?: string;
  pref?: string;
  roadmap?: string;
  stage?: string;
  partner?: string;
  about?: string;
}

type PanelKey = "why" | "walker" | "setup" | "path" | "asks";

const PANEL: { key: PanelKey; label: string; icon: keyof SettingsIcon }[] = [
  { key: "why", label: "Why", icon: "about" },
  { key: "walker", label: "Walker", icon: "account" },
  { key: "setup", label: "Setup", icon: "pref" },
  { key: "path", label: "Path", icon: "roadmap" },
  { key: "asks", label: "Asks", icon: "partner" },
];

/* ── table primitives ─────────────────────────────────────────────────────
 *
 * Real `<table>` markup, not a grid of divs. A screen reader announces row and
 * column relationships from the element, and the relationships ARE the content
 * here — six offices against one status column is the whole point.
 *
 * `tableLayout: fixed` is load-bearing on a 375 px phone. Under auto layout one
 * long ask sets the column width for every row, which is how a table on mobile
 * becomes two columns of one word each.
 */
function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <table
      aria-label={label}
      style={{
        width: "100%",
        borderCollapse: "collapse",
        tableLayout: "fixed",
        background: TONE.card,
        borderRadius: RADIUS.tile,
        overflow: "hidden",
        border: `1px solid ${TONE.edge}`,
      }}
    >
      {children}
    </table>
  );
}

function Th({ children, width }: { children: ReactNode; width?: string }) {
  return (
    <th
      scope="col"
      style={{
        width,
        textAlign: "left",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: TONE.faint,
        padding: "8px 10px",
        borderBottom: `1px solid ${TONE.rule}`,
        background: "rgb(var(--mg-ink-rgb) / 0.03)",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, is_head = false }: { children: ReactNode; is_head?: boolean }) {
  const style: React.CSSProperties = {
    padding: "9px 10px",
    borderBottom: `1px solid ${TONE.rule}`,
    fontSize: is_head ? 13 : 12.5,
    fontWeight: is_head ? 800 : 500,
    color: is_head ? "var(--mg-text-boldest)" : "rgb(var(--mg-ink-rgb) / 0.8)",
    lineHeight: 1.45,
    verticalAlign: "top",
    textAlign: "left",
    /* Long names break rather than widening the column past its share. */
    overflowWrap: "anywhere",
  };
  return is_head ? (
    <th scope="row" style={style}>
      {children}
    </th>
  ) : (
    <td style={style}>{children}</td>
  );
}

function Pill({ tone, children }: { tone: "green" | "gold" | "grey"; children: ReactNode }) {
  const map = {
    green: { fg: "var(--mg-green-text)", bd: "rgba(62,154,74,0.5)" },
    gold: { fg: TONE.gold, bd: "rgba(247,198,49,0.5)" },
    grey: { fg: TONE.faint, bd: "rgb(var(--mg-ink-rgb) / 0.15)" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: "0.04em",
        color: map.fg,
        border: `1px solid ${map.bd}`,
        borderRadius: 999,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Switch({ is_on, onToggle, label }: { is_on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={is_on}
      aria-label={label}
      onClick={onToggle}
      style={{
        width: 44,
        height: 26,
        borderRadius: 999,
        border: "none",
        padding: 0,
        background: is_on ? TONE.green : "rgb(var(--mg-ink-rgb) / 0.16)",
        position: "relative",
        cursor: "pointer",
        transition: "background .18s ease",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 3,
          left: is_on ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: 999,
          background: "#fff",
          transition: "left .18s ease",
          boxShadow: "0 1px 3px rgba(17,75,47,0.2)",
        }}
      />
    </button>
  );
}

const INPUT: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "8px 10px",
  borderRadius: 9,
  border: `1.5px solid ${TONE.edge}`,
  background: "#fff",
  color: "var(--mg-text-boldest)",
  fontSize: 13.5,
  fontWeight: 700,
  /* 44 px: the smallest hit area a thumb reliably lands on. */
  minHeight: 44,
};

const BTN: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 9,
  border: "none",
  background: TONE.green,
  color: "#fff",
  fontWeight: 800,
  fontSize: 12.5,
  cursor: "pointer",
  minHeight: 44,
  flexShrink: 0,
};

export default function SettingsScreen({
  is_desktop,
  preference,
  onPreference,
  walker_name,
  account_name = null,
  join_code,
  is_live,
  icon = {},
  onJoin,
  plan,
  quality_label,
  is_setup_first = false,
}: {
  is_desktop: boolean;
  preference: Preference;
  onPreference: (next: Preference) => void;
  walker_name: string;
  /** The signed-in account's display_name — what everybody else sees — or null when signed out. */
  account_name?: string | null;
  join_code: string;
  is_live: boolean;
  icon?: SettingsIcon;
  onJoin: (code: string) => void;
  /**
   * The Working Doc's PLAN tab, folded in rather than deleted. The four-tab
   * structure is the committee's approved framework and PLAN is in it, so the
   * long-form plan keeps a home at the bottom of the Path panel.
   */
  plan?: ReactNode;
  /** What the map's badge says right now, e.g. "Lite graphics · auto, measured". */
  quality_label?: string;
  /** Open on Setup — the map's graphics badge sends people here to change it. */
  is_setup_first?: boolean;
}) {
  /* Back from Google sign-in (?account= / ?account_error=) → open on the account. */
  const [panel, setPanel] = useState<PanelKey>(() =>
    is_setup_first
      ? "setup"
      : typeof location !== "undefined" && /[?&]account(_error)?=/.test(location.search)
        ? "walker"
        : "why",
  );
  const [name_draft, setNameDraft] = useState(preference.walker_name || walker_name);
  const [join_draft, setJoinDraft] = useState("");
  const muted = useMuted();
  const stage_index = STAGE_LADDER.findIndex((s) => s.key === STAGE_NOW);

  return (
    <div
      className="scroll-soft"
      style={{
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        background: TONE.panel,
        color: TONE.text,
        padding: is_desktop ? "22px 56px 190px" : "14px 14px 190px",
      }}
    >
      <div style={{ maxWidth: 720, margin: is_desktop ? "0 auto" : undefined }}>
        {/* ── identity strip: the stage first, because it qualifies the rest ── */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 12px 12px 14px",
            borderRadius: 22,
            overflow: "hidden",
            boxShadow: "var(--mg-sticker)",
            background: "linear-gradient(180deg, #9BD6F8 0%, #DDF2FF 58%, #D7EFC0 58%, #BFE39A 100%)",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <img
              src="/brand/magi/lockup-horizontal.svg"
              alt="Magisphere — Rediscovering home."
              style={{ display: "block", width: "100%", maxWidth: 300, height: "auto" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Pill tone="gold">ALPHA</Pill>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--mg-forest)", lineHeight: 1.35 }}>
                A student field guide to the Ateneo campus forest · Youth CLAP 2026
              </span>
            </div>
          </div>
          <img className="mg-bob" src={sticker.buddy_map} alt="" width={84} height={84} style={{ flexShrink: 0 }} />
        </div>

        {/* ── the tab bar. Five fixed columns, so it never scrolls sideways. ── */}
        <div
          role="tablist"
          aria-label="Settings sections"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 4,
            marginTop: 10,
            padding: 4,
            /* Flat: a white bar with the one small shadow, and the active tab
               marked by a solid green bottom edge — not a grey tray with an
               inset, pressed-in tab. */
            borderRadius: 14,
            background: TONE.card,
            boxShadow: "var(--mg-sticker)",
          }}
        >
          {PANEL.map((row) => {
            const is_on = panel === row.key;
            const art = icon[row.icon];
            return (
              <button
                key={row.key}
                type="button"
                role="tab"
                aria-selected={is_on}
                onClick={() => setPanel(row.key)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "7px 2px 6px",
                  borderRadius: 0,
                  border: "none",
                  background: "transparent",
                  boxShadow: is_on ? "inset 0 -3px 0 0 var(--mg-green)" : "none",
                  color: is_on ? "var(--mg-green-text)" : TONE.dim,
                  fontWeight: 800,
                  fontSize: 11,
                  cursor: "pointer",
                  minWidth: 0,
                }}
              >
                {art ? (
                  <img src={art} alt="" width={22} height={22} style={{ opacity: is_on ? 1 : 0.55 }} />
                ) : (
                  <span aria-hidden="true" style={{ height: 22 }} />
                )}
                {row.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 12 }}>
          {/* ── WHY ─────────────────────────────────────────────────────── */}
          {panel === "why" && (
            <>
              {/* Four headings, each one a whole sentence that carries its own
                  point, with the paragraph behind a disclosure.
                  
                  Side by side in two columns the same four beats ran to 1,816 px
                  — two and a bit screens of body copy for somebody who mostly
                  wants to know what this is. Collapsed, the argument is legible
                  in one screen and the evidence is one tap away, which is the
                  right order for a booth. The first is open, so the panel never
                  reads as four buttons and no content. */}
              <Table label="Why Magisphere exists">
                <thead>
                  <tr>
                    {/* px, not a bare number: a unitless CSS `width` is invalid
                        and silently ignored, which under `tableLayout: fixed`
                        splits the table 50/50 and gives a one-digit column half
                        the screen. */}
                    <Th width="42px">#</Th>
                    <Th>The argument · tap to open</Th>
                  </tr>
                </thead>
                <tbody>
                  {ESSAY.map((beat, i) => (
                    <tr key={beat.key}>
                      <Td is_head>
                        <span
                          aria-hidden="true"
                          style={{
                            display: "grid",
                            placeItems: "center",
                            width: 20,
                            height: 20,
                            borderRadius: 999,
                            background: TONE.green_soft,
                            border: `1px solid ${TONE.green}`,
                            color: "var(--mg-green-text)",
                            fontSize: 11,
                            fontWeight: 900,
                          }}
                        >
                          {i + 1}
                        </span>
                      </Td>
                      <Td>
                        <details open={i === 0}>
                          <summary
                            style={{
                              cursor: "pointer",
                              /* A 44 px row to tap, not an 18 px line of type. */
                              minHeight: 44,
                              boxSizing: "border-box",
                              padding: "12px 0",
                              fontWeight: 800,
                              fontSize: 13,
                              color: "var(--mg-text-boldest)",
                              lineHeight: 1.35,
                            }}
                          >
                            {beat.heading}
                          </summary>
                          <p style={{ margin: "7px 0 0", lineHeight: 1.5 }}>{beat.body}</p>
                          {beat.source && (
                            <p
                              style={{
                                margin: "6px 0 0",
                                fontSize: 10,
                                color: TONE.faint,
                                fontStyle: "italic",
                              }}
                            >
                              {beat.source}
                            </p>
                          )}
                        </details>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <div style={{ marginTop: 12 }}>
                <Table label="What this is not">
                  <thead>
                    <tr>
                      <Th>What this is not</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {LIMIT.map((line) => (
                      <tr key={line}>
                        <Td>
                          <span aria-hidden="true" style={{ color: TONE.gold, fontWeight: 900, marginRight: 7 }}>
                            !
                          </span>
                          {line}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}

          {/* ── WALKER ──────────────────────────────────────────────────── */}
          {panel === "walker" && (
            <>
              <Table label="Your walker">
                <thead>
                  <tr>
                    <Th width="34%">Your walker</Th>
                    <Th>&nbsp;</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td is_head>Display name</Td>
                    <Td>
                      {account_name ? (
                        <>
                          <div style={{ fontSize: 15, fontWeight: 900, color: "var(--mg-forest)" }}>{account_name}</div>
                          <div style={{ fontSize: 11, color: TONE.faint, marginTop: 3, lineHeight: 1.4 }}>
                            Your account's name — the one the live campus sees while you are signed in.
                          </div>
                        </>
                      ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          value={name_draft}
                          onChange={(e) => setNameDraft(e.target.value.slice(0, 40))}
                          placeholder={walker_name}
                          aria-label="Your display name on the live campus"
                          style={INPUT}
                        />
                        <button
                          type="button"
                          onClick={() => onPreference({ ...preference, walker_name: name_draft.trim() })}
                          style={BTN}
                        >
                          Save
                        </button>
                      </div>
                      )}
                    </Td>
                  </tr>
                  <tr>
                    <Td is_head>Walker code</Td>
                    <Td>
                      <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.14em", color: "var(--mg-forest)" }}>
                        {join_code}
                      </div>
                      <div style={{ fontSize: 11, color: TONE.faint, marginTop: 3, lineHeight: 1.4 }}>
                        Not a password — anybody with it becomes you.
                      </div>
                    </Td>
                  </tr>
                  <tr>
                    <Td is_head>Join a phone</Td>
                    <Td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          value={join_draft}
                          onChange={(e) => setJoinDraft(e.target.value.toUpperCase().slice(0, 7))}
                          placeholder="THEIR CODE"
                          aria-label="Join another phone's walker by code"
                          autoCapitalize="characters"
                          autoCorrect="off"
                          spellCheck={false}
                          style={{ ...INPUT, letterSpacing: "0.12em" }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            onJoin(join_draft);
                            setJoinDraft("");
                          }}
                          style={{
                            ...BTN,
                            background: "transparent",
                            color: TONE.green,
                            border: `1.5px solid ${TONE.green}`,
                          }}
                        >
                          Join
                        </button>
                      </div>
                    </Td>
                  </tr>
                  <tr>
                    <Td is_head>Live campus</Td>
                    <Td>{is_live ? <Pill tone="green">ON</Pill> : <Pill tone="grey">OFF</Pill>}</Td>
                  </tr>
                </tbody>
              </Table>

              <div style={{ marginTop: 12 }}>
                <AccountPanel />
              </div>
            </>
          )}

          {/* ── SETUP ───────────────────────────────────────────────────── */}
          {panel === "setup" && (
            <>
            <Table label="Preferences, saved on this device">
              <thead>
                <tr>
                  <Th width="42%">Setting</Th>
                  <Th>What it does</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td is_head>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Switch
                        is_on={preference.is_haptic}
                        onToggle={() => onPreference({ ...preference, is_haptic: !preference.is_haptic })}
                        label="Haptics"
                      />
                      Haptics
                    </div>
                  </Td>
                  <Td>
                    A short buzz when you log a find or pick up the stick. iPhones cannot vibrate from a web
                    page, so this does nothing there.
                  </Td>
                </tr>
                <tr>
                  <Td is_head>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Switch
                        is_on={preference.is_hidden_from_hall}
                        onToggle={() =>
                          onPreference({ ...preference, is_hidden_from_hall: !preference.is_hidden_from_hall })
                        }
                        label="Hide me from the live map"
                      />
                      Hide me from the live map
                    </div>
                  </Td>
                  <Td>
                    Other phones stop drawing you and your name, at once, and you still see everyone else. A find
                    you log is still shared — the species and where — but under "A walker", never your name, and
                    nobody nearby is told you logged it.
                  </Td>
                </tr>
                <tr>
                  <Td is_head>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Switch
                        is_on={preference.is_restricted_shown}
                        onToggle={() =>
                          onPreference({
                            ...preference,
                            is_restricted_shown: !preference.is_restricted_shown,
                          })
                        }
                        label="Show the restricted grove"
                      />
                      Restricted grove
                    </div>
                  </Td>
                  <Td>
                    Draws the hatch over ground students may not enter. Turning it off hides the drawing only
                    — the ground stays off-limits and nothing ever spawns there.
                  </Td>
                </tr>
                <tr>
                  <Td is_head>
                    Buildings
                    <div style={{ display: "flex", gap: 4, marginTop: 7 }}>
                      {(["block", "shadow", "hollow", "solid"] as const).map((style) => (
                        <button
                          key={style}
                          type="button"
                          aria-pressed={preference.skyline_style === style}
                          onClick={() => onPreference({ ...preference, skyline_style: style })}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: "5px 2px",
                            borderRadius: 7,
                            border: `1.5px solid ${
                              preference.skyline_style === style ? TONE.green : TONE.edge
                            }`,
                            background: preference.skyline_style === style ? TONE.green_soft : "transparent",
                            color: preference.skyline_style === style ? "var(--mg-green-text)" : TONE.dim,
                            fontWeight: 800,
                            fontSize: 10.5,
                            textTransform: "capitalize",
                            cursor: "pointer",
                          }}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    Block is a low building, a few metres of wall on every one, so it looks built without
                    hiding much. Full walls look most solid but are drawn above the map, so a building can
                    cover a path that is actually in front of it. Shadow never does.
                  </Td>
                </tr>
                <tr>
                  <Td is_head>
                    Hidden walkers
                    <div style={{ marginTop: 7 }}>
                      <button
                        type="button"
                        disabled={muted.size === 0}
                        onClick={() => unmuteAll()}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 7,
                          border: `1.5px solid ${TONE.edge}`,
                          background: "transparent",
                          color: muted.size ? "var(--mg-green-text)" : TONE.faint,
                          fontWeight: 800,
                          fontSize: 10.5,
                          cursor: muted.size ? "pointer" : "default",
                        }}
                      >
                        Show {muted.size || "none"} again
                      </button>
                    </div>
                  </Td>
                  <Td>
                    Walkers you hid from their name tag on the map. Hiding is on this phone only — they are not told,
                    and they still count as out.
                  </Td>
                </tr>
                <tr>
                  <Td is_head>
                    Graphics
                    <div style={{ display: "flex", gap: 4, marginTop: 7 }}>
                      {(["auto", "full", "lite"] as const).map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          aria-pressed={preference.quality === choice}
                          onClick={() => onPreference({ ...preference, quality: choice })}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: "5px 2px",
                            borderRadius: 7,
                            border: `1.5px solid ${preference.quality === choice ? TONE.green : TONE.edge}`,
                            background: preference.quality === choice ? TONE.green_soft : "transparent",
                            color: preference.quality === choice ? "var(--mg-green-text)" : TONE.dim,
                            fontWeight: 800,
                            fontSize: 10.5,
                            textTransform: "capitalize",
                            cursor: "pointer",
                          }}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    Lite draws fewer trees, no birds or drifting clouds, and no soft shadow under the
                    buildings, so a slower phone or laptop walks smoothly. The map, the finds and your walker
                    are the same in both. Auto starts full and switches to lite if this device measures slow
                    while you walk.
                    {quality_label && (
                      <div style={{ marginTop: 5, fontWeight: 700, color: TONE.text }}>Now: {quality_label}</div>
                    )}
                  </Td>
                </tr>
              </tbody>
            </Table>

            {/* Gelo, 09-30 (`3:39`): performance, bugs and the reporting
                system, accounted for. The form states what it attaches. */}
            <section
              aria-label="Report a problem"
              style={{
                marginTop: 12,
                background: TONE.card,
                borderRadius: RADIUS.tile,
                border: `1px solid ${TONE.edge}`,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 4 }}>Report a problem</div>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: TONE.dim, lineHeight: 1.45 }}>
                Lag, walkers jumping, a model that looks wrong, the wrong tree in the wrong place — tell the team. A
                moderator reads every report. To report somebody&apos;s name, tap their name tag on the map.
              </p>
              <ReportForm />
            </section>
            </>
          )}

          {/* ── PATH ────────────────────────────────────────────────────── */}
          {panel === "path" && (
            <>
              <Table label="Where this is going">
                <thead>
                  <tr>
                    <Th width="30%">Stage</Th>
                    <Th>What changes</Th>
                  </tr>
                </thead>
                <tbody>
                  {STAGE_LADDER.map((row, i) => (
                    <tr
                      key={row.key}
                      style={{ background: i === stage_index ? "rgba(247,198,49,0.07)" : undefined }}
                    >
                      <Td is_head>
                        {row.label}
                        <div style={{ marginTop: 4 }}>
                          {i < stage_index ? (
                            <Pill tone="green">DONE</Pill>
                          ) : i === stage_index ? (
                            <Pill tone="gold">NOW</Pill>
                          ) : (
                            <Pill tone="grey">LATER</Pill>
                          )}
                        </div>
                      </Td>
                      <Td>{row.blurb}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {plan && (
                <details style={{ marginTop: 12 }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      minHeight: 44,
                      boxSizing: "border-box",
                      padding: "12px 12px",
                      borderRadius: RADIUS.tile,
                      border: `1px solid ${TONE.edge}`,
                      background: TONE.card,
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    The full Youth CLAP plan
                  </summary>
                  <div style={{ marginTop: 12 }}>{plan}</div>
                </details>
              )}
            </>
          )}

          {/* ── ASKS ────────────────────────────────────────────────────── */}
          {panel === "asks" && (
            <>
              <p style={{ fontSize: 12, color: TONE.dim, margin: "0 0 10px", lineHeight: 1.45 }}>
                What we need from each office.{" "}
                <b style={{ color: "rgb(var(--mg-ink-rgb) / 0.88)" }}>None have agreed yet</b> — this is the ask,
                not a partnership.
              </p>
              <Table label="Offices we are asking">
                <thead>
                  <tr>
                    <Th width="30%">Office</Th>
                    <Th>What we need</Th>
                  </tr>
                </thead>
                <tbody>
                  {PARTNER.map((row) => (
                    <tr key={row.short}>
                      <Td is_head>
                        {row.short}
                        <div style={{ fontSize: 10.5, fontWeight: 500, color: TONE.faint, marginTop: 2 }}>
                          {row.name}
                        </div>
                        <div style={{ marginTop: 5 }}>
                          {row.is_confirmed ? <Pill tone="green">AGREED</Pill> : <Pill tone="grey">NOT YET</Pill>}
                        </div>
                      </Td>
                      <Td>{row.ask}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </div>

        <p style={{ fontSize: 10.5, color: TONE.faint, marginTop: 18, lineHeight: 1.5 }}>
          Youth CLAP 2026 · student prototype · not an official AIS product.
        </p>
      </div>
    </div>
  );
}
