import { useState, type ReactNode } from "react";
import { RADIUS } from "./ui";
import {
  ESSAY,
  LIMIT,
  PARTNER,
  STAGE_LADDER,
  STAGE_NOW,
} from "./settings-content";
import type { Preference } from "./preference";

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
  panel: "#312e2b",
  card: "#262421",
  edge: "rgba(255,255,255,0.09)",
  rule: "rgba(255,255,255,0.07)",
  text: "rgba(255,255,255,0.86)",
  dim: "rgba(255,255,255,0.55)",
  faint: "rgba(255,255,255,0.4)",
  green: "#81b64c",
  green_soft: "rgba(129,182,76,0.12)",
  gold: "#f7c631",
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
        background: "rgba(255,255,255,0.03)",
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
    color: is_head ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.74)",
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
    green: { fg: "#b2e068", bd: "rgba(129,182,76,0.5)" },
    gold: { fg: TONE.gold, bd: "rgba(247,198,49,0.5)" },
    grey: { fg: TONE.faint, bd: "rgba(255,255,255,0.15)" },
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
        background: is_on ? TONE.green : "rgba(255,255,255,0.16)",
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
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
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
  background: "rgba(0,0,0,0.25)",
  color: "#fff",
  fontSize: 13.5,
  fontWeight: 700,
};

const BTN: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 9,
  border: "none",
  background: TONE.green,
  color: "#12220c",
  fontWeight: 800,
  fontSize: 12.5,
  cursor: "pointer",
  flexShrink: 0,
};

export default function SettingsScreen({
  is_desktop,
  preference,
  onPreference,
  walker_name,
  join_code,
  is_live,
  icon = {},
  onJoin,
  plan,
}: {
  is_desktop: boolean;
  preference: Preference;
  onPreference: (next: Preference) => void;
  walker_name: string;
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
}) {
  const [panel, setPanel] = useState<PanelKey>("why");
  const [name_draft, setNameDraft] = useState(preference.walker_name || walker_name);
  const [join_draft, setJoinDraft] = useState("");
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
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderRadius: RADIUS.tile,
            border: `1px solid ${TONE.edge}`,
            background:
              "radial-gradient(120% 160% at 10% 0%, rgba(129,182,76,0.26) 0%, rgba(0,0,0,0) 68%), " +
              TONE.card,
          }}
        >
          {icon.stage && <img src={icon.stage} alt="" width={40} height={40} style={{ flexShrink: 0 }} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 18 }}>Magisphere</span>
              <Pill tone="gold">ALPHA</Pill>
            </div>
            <div style={{ fontSize: 11.5, color: TONE.dim, marginTop: 1, lineHeight: 1.35 }}>
              A student field guide to the Ateneo campus forest · Youth CLAP 2026
            </div>
          </div>
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
            borderRadius: RADIUS.tile,
            background: "rgba(0,0,0,0.22)",
            border: `1px solid ${TONE.edge}`,
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
                  borderRadius: 7,
                  border: "none",
                  background: is_on ? TONE.green_soft : "transparent",
                  color: is_on ? "#b2e068" : TONE.dim,
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
                            color: "#b2e068",
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
                              fontWeight: 800,
                              fontSize: 13,
                              color: "rgba(255,255,255,0.92)",
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
                    </Td>
                  </tr>
                  <tr>
                    <Td is_head>Walker code</Td>
                    <Td>
                      <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.14em", color: "#fff" }}>
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
                <Table label="Sign-in">
                  <thead>
                    <tr>
                      <Th width="34%">Sign-in</Th>
                      <Th>Not yet — and why</Th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <Td is_head>Account</Td>
                      <Td>
                        There is none. No password, no Ateneo sign-in. Your journal lives in this browser
                        and nowhere else.
                      </Td>
                    </tr>
                    <tr>
                      <Td is_head>If you clear data</Td>
                      <Td>It is gone, and we cannot restore it for you.</Td>
                    </tr>
                    <tr>
                      <Td is_head>Why not yet</Td>
                      <Td>
                        Real accounts mean storing student names, photos and locations. The project has not
                        agreed with Ateneo what may be collected, who may see it, or how long it is kept.
                        Those terms come first.
                      </Td>
                    </tr>
                  </tbody>
                </Table>
              </div>
            </>
          )}

          {/* ── SETUP ───────────────────────────────────────────────────── */}
          {panel === "setup" && (
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
                      {(["shadow", "hollow", "solid"] as const).map((style) => (
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
                            color: preference.skyline_style === style ? "#b2e068" : TONE.dim,
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
                    Full walls look most solid but are drawn above the map, so a building can cover a path
                    that is actually in front of it. Shadow never does.
                  </Td>
                </tr>
              </tbody>
            </Table>
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
                      padding: "10px 12px",
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
                <b style={{ color: "rgba(255,255,255,0.82)" }}>None have agreed yet</b> — this is the ask,
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
