/**
 * "To do" — everything the map is asking of you, in one place.
 *
 * Gelo, 10-01: improve the display of "things to do", more objectives anyone
 * can do, SEEDS challenges students cannot cheat, and a group walk. Three
 * sections, in that order of who they are for:
 *
 *   Today      — three objectives, one look / one log / one move (`objective.ts`).
 *   SEEDS      — challenges an organiser set, claimed and judged on the server
 *                (`quest.ts`, `worker/quest.ts`); a class code shows a class's own.
 *   Group walk — start one and show the code, or join with it (`party.ts`).
 *
 * The chip that opens it (`TodoChip`) sits under the hunt banner and says how
 * many are left, so the map itself carries one line, not a list.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ObjectiveProgress } from "./objective";
import { isQuestOpen, questNeedLine, type Quest, type QuestVerdict } from "./quest";
import type { QuestBoard } from "./quest-client";
import { cleanPartyCode, PARTY_GOAL_SPECIES, PARTY_MAX, PARTY_NEAR_M, type Party, type PartyWalker } from "./party";
import { distanceMeter, formatMeter, type LatLon } from "./geo";

const shell_text: CSSProperties = { fontSize: 12.5, lineHeight: 1.45, color: "rgb(var(--mg-ink-rgb) / 0.78)" };
const small_text: CSSProperties = { fontSize: 11, lineHeight: 1.4, color: "rgb(var(--mg-ink-rgb) / 0.6)" };

function Bar({ value, max, tone = "var(--mg-green)" }: { value: number; max: number; tone?: string }) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: "rgb(var(--mg-ink-rgb) / 0.1)", overflow: "hidden" }} aria-hidden="true">
      <div style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, height: "100%", background: tone, borderRadius: 999 }} />
    </div>
  );
}

function Pill({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, color: tone, border: `1.5px solid ${tone}`, borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap" }}>{children}</span>
  );
}

function Button({ children, onClick, tone = "var(--mg-green)", is_primary = false, is_disabled = false }: { children: ReactNode; onClick: () => void; tone?: string; is_primary?: boolean; is_disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={is_disabled}
      style={{
        border: `1.5px solid ${is_disabled ? "rgb(var(--mg-ink-rgb) / 0.15)" : tone}`,
        background: is_primary && !is_disabled ? tone : "transparent",
        color: is_disabled ? "rgb(var(--mg-ink-rgb) / 0.4)" : is_primary ? "#FFFFFF" : tone,
        borderRadius: 8,
        padding: "7px 11px",
        fontSize: 12.5,
        fontWeight: 800,
        cursor: is_disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid rgb(var(--mg-ink-rgb) / 0.1)", padding: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, flex: 1 }}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const FAMILY_LABEL = { look: "Look", log: "Log", move: "Move" } as const;

/** The one line on the map: how much is left today, and whether a challenge is open. */
export function TodoChip({ objective, open_quest_count, party_count, onOpen }: { objective: ObjectiveProgress[]; open_quest_count: number; party_count: number | null; onOpen: () => void }) {
  const done = objective.filter((o) => o.is_done).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="gm-todo-chip"
      aria-label={`To do: ${done} of ${objective.length} objectives done today${open_quest_count ? `, ${open_quest_count} SEEDS challenge open` : ""}`}
    >
      <span className="gm-todo-dot" data-done={done === objective.length} />
      <span>
        To do · <b>{done}/{objective.length}</b> today
      </span>
      {open_quest_count > 0 && <span className="gm-todo-seeds">SEEDS {open_quest_count}</span>}
      {party_count !== null && <span className="gm-todo-party">Group {party_count}</span>}
    </button>
  );
}

export interface TodoSheetProps {
  is_desktop: boolean;
  onClose: () => void;
  objective: ObjectiveProgress[];
  board: QuestBoard | null;
  is_board_loading: boolean;
  class_code: string[];
  onClassCode: (code: string[]) => void;
  onClaim: (quest: Quest, site_code: string | null) => Promise<{ verdict: QuestVerdict; point: number } | { error: string }>;
  /** Why a claim cannot be made from here at all (no GPS fix, a stick walk), or null. */
  claim_block: string | null;
  party: Party | null;
  party_member: PartyWalker[];
  party_species: number;
  me: LatLon | null;
  onStartParty: () => void;
  onJoinParty: (code: string) => string | null;
  onLeaveParty: () => void;
}

export default function TodoSheet(p: TodoSheetProps) {
  const shell: CSSProperties = p.is_desktop
    ? { position: "absolute", left: 18, top: 156, bottom: 88, width: 390, zIndex: 56 }
    : { position: "absolute", left: 8, right: 8, bottom: 72, maxHeight: "72%", zIndex: 56 };
  return (
    <div
      role="dialog"
      aria-label="To do"
      style={{
        ...shell,
        overflowY: "auto",
        background: "var(--mg-surface)",
        color: "rgb(var(--mg-ink-rgb) / 0.92)",
        border: "1px solid rgb(var(--mg-ink-rgb) / 0.12)",
        borderRadius: 14,
        boxShadow: "var(--mg-shadow-up)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, flex: 1 }}>To do</h2>
        <button type="button" onClick={p.onClose} aria-label="Close to do" style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "inherit" }}>
          ×
        </button>
      </div>
      <TodaySection objective={p.objective} />
      <SeedsSection {...p} />
      <PartySection {...p} />
    </div>
  );
}

function TodaySection({ objective }: { objective: ObjectiveProgress[] }) {
  return (
    <Section title="Today" aside={<span style={small_text}>Same three for everyone · new at midnight</span>}>
      {objective.map((o) => (
        <div key={o.objective_id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 10px", marginBottom: 10, opacity: o.is_done ? 0.6 : 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>
            {o.is_done ? "✓ " : ""}
            {o.title}
          </div>
          <Pill tone={o.family === "look" ? "#6B4FA0" : o.family === "log" ? "#1B7F3B" : "#B26A00"}>{FAMILY_LABEL[o.family]}</Pill>
          <div style={{ ...small_text, gridColumn: "1 / -1" }}>
            {o.how}
            {o.is_gps_only ? " Real GPS only." : ""}
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Bar value={o.current} max={o.target} />
            </div>
            <span style={{ ...small_text, fontWeight: 700 }}>
              {o.objective_id === "move-gps-400" ? `${o.current}/${o.target} m` : `${o.current}/${o.target}`}
            </span>
          </div>
        </div>
      ))}
    </Section>
  );
}

function windowLine(q: Quest, now_ms: number): string {
  const end = Date.parse(q.end_at);
  const start = Date.parse(q.start_at);
  const fmt = new Intl.DateTimeFormat([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (now_ms < start) return `opens ${fmt.format(start)}`;
  if (q.status === "closed" || now_ms >= end) return "closed";
  return `until ${fmt.format(end)}`;
}

function SeedsSection(p: TodoSheetProps) {
  const [class_input, setClassInput] = useState("");
  const [open_code, setOpenCode] = useState<string | null>(null);
  const now = p.board ? Date.parse(p.board.now) : Date.now();
  const claim_of = (quest_code: string) => p.board?.claim.find((c) => c.quest_code === quest_code) ?? null;
  return (
    <Section
      title="SEEDS challenges"
      aside={p.board ? <span style={{ ...small_text, fontWeight: 800 }}>{p.board.verified_point} verified pts</span> : null}
    >
      <p style={{ ...small_text, margin: "0 0 8px" }}>
        Set by the AVP-SEEDS office and teachers. A claim is checked by the campus server: where you are, on real GPS, and the site
        code when the challenge has one.
      </p>
      {p.is_board_loading && !p.board && <p style={shell_text}>Loading…</p>}
      {!p.is_board_loading && !p.board && <p style={shell_text}>Cannot reach the campus server right now.</p>}
      {p.board && p.board.quest.length === 0 && <p style={shell_text}>No challenge is open for you right now.</p>}
      {p.board?.quest.map((q) => {
        const claim = claim_of(q.quest_code);
        const is_open = isQuestOpen(q, now);
        return (
          <div key={q.quest_code} style={{ border: "1px solid rgb(var(--mg-ink-rgb) / 0.12)", borderRadius: 10, padding: "9px 11px", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <strong style={{ fontSize: 13.5, flex: 1 }}>{q.title}</strong>
              <span style={{ ...small_text, fontWeight: 800 }}>+{q.point}</span>
            </div>
            {q.brief && <div style={{ ...shell_text, margin: "2px 0" }}>{q.brief}</div>}
            <div style={small_text}>
              {questNeedLine(q).join(" · ")} · {windowLine(q, now)}
              {q.class_code ? ` · class ${q.class_code}` : ""}
            </div>
            {claim ? (
              <ClaimLine status={claim.status} reason={claim.reason} point={claim.point} />
            ) : is_open ? (
              open_code === q.quest_code ? (
                <ClaimForm quest={q} block={p.claim_block} onClaim={p.onClaim} onCancel={() => setOpenCode(null)} />
              ) : (
                <div style={{ marginTop: 6 }}>
                  <Button is_primary onClick={() => setOpenCode(q.quest_code)}>
                    Claim
                  </Button>
                </div>
              )
            ) : null}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
        <input
          value={class_input}
          onChange={(e) => setClassInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
          placeholder="Class code"
          aria-label="Class code from your teacher"
          style={{ flex: 1, padding: "7px 9px", borderRadius: 8, border: "1px solid rgb(var(--mg-ink-rgb) / 0.2)", fontSize: 13 }}
        />
        <Button
          is_disabled={class_input.length < 4}
          onClick={() => {
            p.onClassCode([...p.class_code, class_input]);
            setClassInput("");
          }}
        >
          Add class
        </Button>
      </div>
      {p.class_code.length > 0 && (
        <div style={{ ...small_text, marginTop: 4 }}>
          Your classes:{" "}
          {p.class_code.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => p.onClassCode(p.class_code.filter((x) => x !== c))}
              aria-label={`Remove class ${c}`}
              style={{ border: "none", background: "rgb(var(--mg-ink-rgb) / 0.07)", borderRadius: 6, padding: "1px 6px", marginRight: 4, cursor: "pointer", fontSize: 11 }}
            >
              {c} ×
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function ClaimLine({ status, reason, point }: { status: "accepted" | "review" | "void"; reason: string[]; point: number }) {
  const tone = status === "accepted" ? "#1B7F3B" : status === "review" ? "#B26A00" : "#B3261E";
  const label = status === "accepted" ? `Verified · +${point}` : status === "review" ? "Waiting for a person to check" : "Not counted";
  return (
    <div style={{ marginTop: 6 }}>
      <Pill tone={tone}>{label}</Pill>
      {reason.length > 0 && <div style={{ ...small_text, marginTop: 3 }}>{reason.join(" ")}</div>}
    </div>
  );
}

function ClaimForm({ quest, block, onClaim, onCancel }: { quest: Quest; block: string | null; onClaim: TodoSheetProps["onClaim"]; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ verdict: QuestVerdict; point: number } | { error: string } | null>(null);
  if (result && "verdict" in result && result.verdict.status !== "refused") {
    return <ClaimLine status={result.verdict.status === "accepted" ? "accepted" : "review"} reason={result.verdict.reason} point={result.point} />;
  }
  return (
    <div style={{ marginTop: 6 }}>
      {block && <p style={{ ...shell_text, fontWeight: 700, color: "#B3261E", margin: "0 0 6px" }}>{block}</p>}
      {quest.is_site_code && (
        <input
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6-digit site code"
          aria-label="Site code shown at the place"
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 8, border: "1px solid rgb(var(--mg-ink-rgb) / 0.25)", fontSize: 20, letterSpacing: 6, textAlign: "center", marginBottom: 6 }}
        />
      )}
      {result && "verdict" in result && <div style={{ ...shell_text, color: "#B3261E", marginBottom: 6 }}>{result.verdict.reason.join(" ")}</div>}
      {result && "error" in result && <div style={{ ...shell_text, color: "#B3261E", marginBottom: 6 }}>{result.error}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <Button
          is_primary
          is_disabled={busy || Boolean(block) || (quest.is_site_code && code.length !== 6)}
          onClick={async () => {
            setBusy(true);
            setResult(await onClaim(quest, quest.is_site_code ? code : null));
            setBusy(false);
          }}
        >
          {busy ? "Checking…" : "Send claim"}
        </Button>
        <Button tone="rgb(var(--mg-ink-rgb) / 0.6)" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PartySection(p: TodoSheetProps) {
  const [join, setJoin] = useState("");
  const [join_error, setJoinError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  if (!p.party) {
    return (
      <Section title="Group walk">
        <p style={{ ...small_text, margin: "0 0 8px" }}>
          Walk with up to {PARTY_MAX - 1} others. Start one and read out the code, or type theirs. Joining closes 15 minutes after it starts;
          the group counts finds made within {PARTY_NEAR_M} m of the host.
        </p>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Button is_primary onClick={p.onStartParty}>
            Start a group
          </Button>
          <input
            inputMode="numeric"
            value={join}
            onChange={(e) => setJoin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Code"
            aria-label="Group code from the host"
            style={{ width: 90, padding: "7px 9px", borderRadius: 8, border: "1px solid rgb(var(--mg-ink-rgb) / 0.2)", fontSize: 14, letterSpacing: 2 }}
          />
          <Button
            is_disabled={!cleanPartyCode(join)}
            onClick={() => {
              setJoinError(p.onJoinParty(join));
            }}
          >
            Join
          </Button>
        </div>
        {join_error && <p style={{ ...shell_text, color: "#B3261E", margin: "6px 0 0" }}>{join_error}</p>}
      </Section>
    );
  }
  const minute_left = Math.max(0, Math.ceil((p.party.since + 15 * 60 * 1000 - now) / 60000));
  const host = p.party.role === "host" ? null : p.party_member.find((m) => typeof m.party_since === "number") ?? null;
  return (
    <Section title={p.party.role === "host" ? "Your group" : "Group walk"} aside={<Button tone="#B3261E" onClick={p.onLeaveParty}>{p.party.role === "host" ? "End" : "Leave"}</Button>}>
      {p.party.role === "host" && (
        <div style={{ textAlign: "center", margin: "2px 0 8px" }}>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 8 }}>{p.party.code}</div>
          <div style={small_text}>{minute_left > 0 ? `Others can join for ${minute_left} more min` : "No longer taking new walkers"}</div>
        </div>
      )}
      <div style={{ ...shell_text, marginBottom: 6 }}>
        {p.party_member.length === 0 ? "Nobody else is in yet." : `${p.party_member.length + 1} walking together`}
      </div>
      {p.party_member.map((m) => {
        const metre = p.me ? distanceMeter(p.me, m) : null;
        return (
          <div key={m.walker_id} style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 3 }}>
            <span style={{ flex: 1, fontWeight: 700 }}>
              {m.name}
              {typeof m.party_since === "number" ? " (host)" : ""}
            </span>
            <span style={small_text}>{metre === null ? "" : metre <= PARTY_NEAR_M ? `${formatMeter(metre)} · together` : `${formatMeter(metre)} · too far for credit`}</span>
          </div>
        );
      })}
      {host && p.me && distanceMeter(p.me, host) > PARTY_NEAR_M && (
        <p style={{ ...shell_text, color: "#B26A00", margin: "6px 0 0" }}>You are more than {PARTY_NEAR_M} m from the host: your finds do not count for the group until you catch up.</p>
      )}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>Group goal: {PARTY_GOAL_SPECIES} different species together</div>
        <Bar value={p.party_species} max={PARTY_GOAL_SPECIES} tone="#F0B429" />
        <div style={{ ...small_text, marginTop: 2 }}>{Math.min(p.party_species, PARTY_GOAL_SPECIES)}/{PARTY_GOAL_SPECIES} since the group started</div>
      </div>
    </Section>
  );
}
