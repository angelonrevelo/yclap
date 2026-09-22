import { useState, type ReactNode } from "react";
import { Card, Eyebrow, RADIUS } from "./ui";
import {
  ESSAY,
  LIMIT,
  PARTNER,
  STAGE_LADDER,
  STAGE_NOW,
} from "./settings-content";
import type { Preference } from "./preference";

/**
 * Settings — the screen that says what this is, who made it, how far along it
 * is, and who it is talking to.
 *
 * It replaces the Plan tab rather than sitting beside it, and it carries Plan's
 * job forward: the Working Doc's four-tab structure gives PLAN the brief "from
 * data to action — what happens after the walk, who we work with, how to get
 * involved", and every one of those is a section below. What is added is the
 * part a student at a booth actually asks first, which the old Plan tab never
 * answered: *what IS this, and can I trust it yet?*
 *
 * ## The rule this screen is built on
 *
 * It is the surface most able to overclaim, so it is the surface that claims
 * least. The stage ladder says **alpha** and spells out what alpha costs you.
 * The partner list is headed by what we have ASKED each office for, with an
 * explicit "none of these have agreed yet", because the Working Doc's own first
 * objective forbids the other version: *"Record who answered and who did not.
 * Do not claim '20 representatives consulted' until that number is real."* And
 * the limits sit on the same screen as the pitch, not a tap away from it.
 *
 * Accounts are the same story. There is no server-side account, no password and
 * no Ateneo SSO — SSO is blocked on the Working Doc's data decisions, not on
 * engineering. What exists is the walker identity the sync layer already mints,
 * so that is what the Account section shows: a name you can change, the code
 * that joins a second phone to this walker, and a straight sentence about what
 * happens if you clear your browser.
 */

const TONE = {
  panel: "#312e2b",
  edge: "rgba(255,255,255,0.08)",
  text: "rgba(255,255,255,0.85)",
  dim: "rgba(255,255,255,0.55)",
  green: "#81b64c",
  green_soft: "rgba(129,182,76,0.12)",
  gold: "#f7c631",
};

function Section({
  icon,
  title,
  caption,
  children,
}: {
  icon?: string;
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {icon && (
          <img
            src={icon}
            alt=""
            width={34}
            height={34}
            style={{ flexShrink: 0, imageRendering: "auto" }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: "rgba(255,255,255,0.92)" }}>{title}</div>
          {caption && (
            <div style={{ fontSize: 12, color: TONE.dim, marginTop: 1, lineHeight: 1.35 }}>{caption}</div>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Switch({
  label,
  hint,
  is_on,
  onToggle,
}: {
  label: string;
  hint?: string;
  is_on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={is_on}
      onClick={onToggle}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        padding: "11px 12px",
        borderRadius: RADIUS.tile,
        border: `1px solid ${TONE.edge}`,
        background: "rgba(255,255,255,0.04)",
        color: TONE.text,
        cursor: "pointer",
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>{label}</span>
        {hint && (
          <span style={{ display: "block", fontSize: 11.5, color: TONE.dim, marginTop: 2, lineHeight: 1.4 }}>
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 44,
          height: 26,
          borderRadius: 999,
          background: is_on ? TONE.green : "rgba(255,255,255,0.16)",
          position: "relative",
          transition: "background .18s ease",
        }}
      >
        <span
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
      </span>
    </button>
  );
}

export interface SettingsIcon {
  account?: string;
  pref?: string;
  roadmap?: string;
  stage?: string;
  partner?: string;
  about?: string;
}

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
   * The Working Doc's PLAN tab, folded in rather than deleted.
   *
   * The four-tab structure (HOME / MAP / JOURNAL / PLAN) is the committee's
   * approved framework and PLAN's brief is "from data to action". Settings
   * carries that brief, but the long-form plan is real work that was approved
   * and should not be orphaned by a tab rename — so it lives at the bottom,
   * collapsed, one tap away.
   */
  plan?: ReactNode;
}) {
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
        padding: is_desktop ? "28px 56px 190px" : "18px 16px 190px",
      }}
    >
      <div style={{ maxWidth: 720, margin: is_desktop ? "0 auto" : undefined }}>
        {/* ── the hero: what stage this is, said first ─────────────────── */}
        <div
          style={{
            borderRadius: RADIUS.tile,
            padding: is_desktop ? "22px 24px" : "18px 16px",
            background:
              "radial-gradient(120% 140% at 12% 0%, rgba(129,182,76,0.30) 0%, rgba(129,182,76,0.10) 42%, rgba(0,0,0,0) 72%), #262421",
            border: `1px solid ${TONE.edge}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {icon.stage && <img src={icon.stage} alt="" width={54} height={54} style={{ flexShrink: 0 }} />}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "inline-block",
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  color: "#12220c",
                  background: TONE.gold,
                  borderRadius: 999,
                  padding: "3px 9px",
                }}
              >
                ALPHA
              </div>
              <h1 style={{ fontWeight: 800, fontSize: is_desktop ? 26 : 22, marginTop: 6, lineHeight: 1.15 }}>
                Magisphere
              </h1>
              <p style={{ fontSize: 13, color: TONE.dim, marginTop: 2, lineHeight: 1.4 }}>
                A field guide to the Ateneo campus forest, built by students for Youth CLAP 2026.
              </p>
            </div>
          </div>

          {/* The ladder, with the rung we are on lit. Four rungs, not a
              percentage — a percentage of an unfinished thing is a guess. */}
          <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
            {STAGE_LADDER.map((row, i) => (
              <div key={row.key} style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    height: 5,
                    borderRadius: 999,
                    background: i <= stage_index ? TONE.green : "rgba(255,255,255,0.13)",
                  }}
                />
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: i === stage_index ? 800 : 600,
                    color: i === stage_index ? "rgba(255,255,255,0.92)" : TONE.dim,
                    marginTop: 5,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.label}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 10, color: "rgba(255,255,255,0.78)" }}>
            {STAGE_LADDER[stage_index].blurb}
          </p>
        </div>

        {/* ── what it is for ───────────────────────────────────────────── */}
        <Section icon={icon.about} title="Why this exists" caption="A minute, if you have one.">
          {ESSAY.map((beat, i) => (
            <Card key={beat.key} style={{ padding: 14, marginTop: i === 0 ? 0 : 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: TONE.green_soft,
                    border: `1px solid ${TONE.green}`,
                    color: TONE.green,
                    fontSize: 11,
                    fontWeight: 900,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.3 }}>{beat.heading}</h2>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 5, color: "rgba(255,255,255,0.8)" }}>
                    {beat.body}
                  </p>
                  {beat.source && (
                    <p style={{ fontSize: 11, color: TONE.dim, marginTop: 6, fontStyle: "italic" }}>
                      {beat.source}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </Section>

        {/* ── account ──────────────────────────────────────────────────── */}
        <Section
          icon={icon.account}
          title="Your walker"
          caption="There is no sign-in yet — this is what stands in for one."
        >
          <Card style={{ padding: 14 }}>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 800, color: TONE.dim, letterSpacing: "0.04em" }}>
              DISPLAY NAME
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input
                value={name_draft}
                onChange={(e) => setNameDraft(e.target.value.slice(0, 40))}
                placeholder={walker_name}
                aria-label="Your display name on the live campus"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "9px 11px",
                  borderRadius: 12,
                  border: `1.5px solid ${TONE.edge}`,
                  background: "rgba(0,0,0,0.22)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              />
              <button
                type="button"
                onClick={() => onPreference({ ...preference, walker_name: name_draft.trim() })}
                style={{
                  padding: "9px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: TONE.green,
                  color: "#12220c",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Save
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: TONE.dim, letterSpacing: "0.04em" }}>
                THIS WALKER'S CODE
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  marginTop: 4,
                  color: "rgba(255,255,255,0.92)",
                }}
              >
                {join_code}
              </div>
              <p style={{ fontSize: 12, color: TONE.dim, marginTop: 4, lineHeight: 1.45 }}>
                Type this on a second phone to make it the same walker. It is not a password — anybody
                with the code becomes you, so share it the way you would share a Wi-Fi name, not a PIN.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={join_draft}
                onChange={(e) => setJoinDraft(e.target.value.toUpperCase().slice(0, 7))}
                placeholder="OTHER PHONE'S CODE"
                aria-label="Join another phone's walker by code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "9px 11px",
                  borderRadius: 12,
                  border: `1.5px solid ${TONE.edge}`,
                  background: "rgba(0,0,0,0.22)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: "0.16em",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  onJoin(join_draft);
                  setJoinDraft("");
                }}
                style={{
                  padding: "9px 14px",
                  borderRadius: 12,
                  border: `1.5px solid ${TONE.green}`,
                  background: "transparent",
                  color: TONE.green,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Join
              </button>
            </div>
          </Card>

          {/* The honest version of "Log in". */}
          <Card style={{ padding: 14, marginTop: 10, borderColor: "rgba(247,198,49,0.35)" }}>
            <Eyebrow>SIGN-IN · NOT YET</Eyebrow>
            <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6, color: "rgba(255,255,255,0.8)" }}>
              There is no account, no password and no Ateneo sign-in. Your journal lives in this
              browser and nowhere else — clear your browsing data and it is gone, and we cannot get it
              back for you.
            </p>
            <p style={{ fontSize: 12, lineHeight: 1.5, marginTop: 8, color: TONE.dim }}>
              That is a decision, not an oversight. Real accounts mean storing student names, photos
              and locations, and the project has not yet agreed with Ateneo what may be collected, who
              may see it, or how long it is kept. Those terms come first; the login comes after.
            </p>
          </Card>
        </Section>

        {/* ── preferences ──────────────────────────────────────────────── */}
        <Section icon={icon.pref} title="Preferences" caption="Saved on this device.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Switch
              label="Haptics"
              hint="A short buzz when you log a find or pick up the stick. iPhones cannot vibrate from a web page, so this does nothing there."
              is_on={preference.is_haptic}
              onToggle={() => onPreference({ ...preference, is_haptic: !preference.is_haptic })}
            />
            <Switch
              label="Show the restricted grove"
              hint="Draws the hatch over ground students may not enter. Turning it off only hides the drawing — the ground stays off-limits and nothing will ever spawn there."
              is_on={preference.is_restricted_shown}
              onToggle={() =>
                onPreference({ ...preference, is_restricted_shown: !preference.is_restricted_shown })
              }
            />
            <div
              style={{
                padding: "11px 12px",
                borderRadius: RADIUS.tile,
                border: `1px solid ${TONE.edge}`,
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>Buildings</div>
              <div style={{ fontSize: 11.5, color: TONE.dim, marginTop: 2, lineHeight: 1.4 }}>
                Full walls look the most solid but are drawn above the map, so a building can cover a
                path that is actually in front of it. Shadow never does.
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                {(["shadow", "hollow", "solid"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    aria-pressed={preference.skyline_style === style}
                    onClick={() => onPreference({ ...preference, skyline_style: style })}
                    style={{
                      flex: 1,
                      padding: "7px 4px",
                      borderRadius: 10,
                      border: `1.5px solid ${preference.skyline_style === style ? TONE.green : TONE.edge}`,
                      background: preference.skyline_style === style ? TONE.green_soft : "transparent",
                      color: preference.skyline_style === style ? "#b2e068" : TONE.dim,
                      fontWeight: 800,
                      fontSize: 12,
                      textTransform: "capitalize",
                      cursor: "pointer",
                    }}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ── roadmap ──────────────────────────────────────────────────── */}
        <Section icon={icon.roadmap} title="Where this is going" caption="Four rungs. We are on the first.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {STAGE_LADDER.map((row, i) => {
              const is_now = i === stage_index;
              const is_done = i < stage_index;
              return (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    gap: 11,
                    padding: "11px 12px",
                    borderRadius: RADIUS.tile,
                    border: `1px solid ${is_now ? "rgba(247,198,49,0.45)" : TONE.edge}`,
                    background: is_now ? "rgba(247,198,49,0.08)" : "rgba(255,255,255,0.03)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      marginTop: 2,
                      background: is_done ? TONE.green : is_now ? TONE.gold : "rgba(255,255,255,0.12)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      color: "#12220c",
                    }}
                  >
                    {is_done ? "✓" : i + 1}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>
                      {row.label}
                      {is_now && (
                        <span style={{ color: TONE.gold, fontSize: 11, marginLeft: 7, fontWeight: 800 }}>
                          YOU ARE HERE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.72)", marginTop: 3, lineHeight: 1.45 }}>
                      {row.blurb}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── partners ─────────────────────────────────────────────────── */}
        <Section
          icon={icon.partner}
          title="Offices we are asking"
          caption="What we need from each. None have agreed yet — this is the ask, not a partnership."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PARTNER.map((row) => (
              <div
                key={row.short}
                style={{
                  padding: "11px 12px",
                  borderRadius: RADIUS.tile,
                  border: `1px solid ${TONE.edge}`,
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                {/* Code and status on one row, full name beneath.
                    Sharing a wrapping row put the pill inline for "MO" and on a
                    line of its own for "Ateneo Institute of Sustainability",
                    so the six cards each aligned differently. The status is the
                    thing being compared down the column, so it is the thing
                    that gets a fixed position. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{row.short}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      flexShrink: 0,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      color: row.is_confirmed ? "#b2e068" : "rgba(255,255,255,0.45)",
                      border: `1px solid ${row.is_confirmed ? "rgba(129,182,76,0.5)" : "rgba(255,255,255,0.14)"}`,
                      borderRadius: 999,
                      padding: "2px 7px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.is_confirmed ? "AGREED" : "NOT YET ASKED"}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: TONE.dim, marginTop: 1 }}>{row.name}</div>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.75)", marginTop: 6, lineHeight: 1.45 }}>
                  {row.ask}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── limits ───────────────────────────────────────────────────── */}
        <Section title="What this is not">
          <Card style={{ padding: 14, borderColor: "rgba(255,255,255,0.12)" }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
              {LIMIT.map((line) => (
                <li key={line} style={{ display: "flex", gap: 9, fontSize: 13, lineHeight: 1.5 }}>
                  <span aria-hidden="true" style={{ color: TONE.gold, fontWeight: 900, flexShrink: 0 }}>
                    !
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>{line}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>

        {plan && (
          <Section title="The full plan" caption="The Youth CLAP plan this app was built against.">
            <details>
              <summary
                style={{
                  cursor: "pointer",
                  padding: "11px 12px",
                  borderRadius: RADIUS.tile,
                  border: `1px solid ${TONE.edge}`,
                  background: "rgba(255,255,255,0.04)",
                  fontWeight: 700,
                  fontSize: 14,
                  listStyle: "none",
                }}
              >
                Open the plan
              </summary>
              <div style={{ marginTop: 12 }}>{plan}</div>
            </details>
          </Section>
        )}

        <p style={{ fontSize: 11, color: TONE.dim, marginTop: 24, lineHeight: 1.5 }}>
          Youth CLAP 2026 · student prototype · not an official AIS product.{" "}
          {is_live ? "Live campus is on." : "Live campus is off — the board and partners are idle."}
        </p>
      </div>
    </div>
  );
}
