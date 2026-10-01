import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { areaName } from "./area-name";
import { species } from "./data";
import { meterToPond } from "./objective";
import { QUEST_KIND, QUEST_KIND_LABEL, siteCodeAt, siteCodeSecondLeft, type Quest, type QuestKind, type QuestSite } from "./quest";
import { sector } from "./sector";

/**
 * The SEEDS console at `/seeds` — where the AVP-SEEDS office, a teacher or an
 * org sets a challenge for students, shows its site code at the place, and
 * checks the claims a person has to look at.
 *
 * A page of the app like `/mod`: `main.tsx` renders it instead of the game on
 * that path. It asks for the SEEDS_TOKEN, keeps it in sessionStorage, and
 * talks to `/seeds/api/*` with it as a Bearer token. The server decides every
 * claim (`worker/quest.ts`); this page only sets challenges up and reviews.
 *
 * The site code is computed HERE, from the challenge's secret, every second —
 * so the screen at the place keeps working with no signal, which is where
 * field sites usually are.
 */

const TOKEN_KEY = "magi.seeds-token";

interface Claim {
  claim_id: string;
  quest_code: string;
  walker_id: string;
  display_name: string;
  is_signed_in: boolean;
  status: "accepted" | "review" | "void";
  reason: string[];
  species_code: string | null;
  lat: number;
  lon: number;
  accuracy_m: number;
  point: number;
  created_at: string;
  decided_by: string | null;
}

type QuestRow = Quest & { secret: string; claim_count: { accepted: number; review: number; void: number } };

interface SeedsState {
  actor: string;
  now: string;
  quest: QuestRow[];
  claim: Claim[];
  strike: { walker_id: string; display_name: string; count: number }[];
  audit: { at: string; actor: string; action: string; target: string; detail: string }[];
}

type Load = { status: "locked"; error: string | null } | { status: "loading" } | { status: "off"; error: string } | { status: "ready"; state: SeedsState; error: string | null };

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", height: "100vh", overflowY: "auto", boxSizing: "border-box", background: "#F2F6F7", color: "#12324A", font: "14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "20px clamp(12px, 4vw, 40px) 60px" },
  card: { background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.12)", marginTop: 14 },
  h2: { margin: "0 0 8px", fontSize: 15, fontWeight: 900 },
  dim: { color: "rgba(18,50,74,0.62)", fontSize: 12 },
  btn: { padding: "6px 11px", borderRadius: 8, border: "1px solid rgba(18,50,74,0.25)", background: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginRight: 6 },
  primary: { background: "#0E5AA7", color: "#fff", borderColor: "#0E5AA7" },
  danger: { borderColor: "#B3261E", color: "#B3261E" },
  input: { padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(18,50,74,0.25)", fontSize: 13, boxSizing: "border-box" },
  label: { display: "block", fontSize: 12, fontWeight: 800, margin: "8px 0 3px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  td: { borderTop: "1px solid rgba(18,50,74,0.1)", padding: "7px 6px", verticalAlign: "top" },
};

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function when(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={S.card}>
      <h2 style={S.h2}>{title}</h2>
      {note && <p style={{ ...S.dim, margin: "0 0 8px" }}>{note}</p>}
      {children}
    </section>
  );
}

/** Places an organiser can pick without typing coordinates: every named area, and the pond. */
function placeList(): (QuestSite & { key: string })[] {
  const out = sector
    .filter((s) => !/^Sector \d+$/.test(s.name))
    .map((s) => ({ key: s.sector_code, lat: s.label_point[0], lon: s.label_point[1], radius_m: 40, name: areaName(s) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pond = { key: "pond", lat: 14.638597, lon: 121.075893, radius_m: 30, name: "the campus pond" };
  return meterToPond(pond) < 60 ? [pond, ...out] : out;
}

/** Accepted claims as CSV — the list a teacher grades from. */
function claimCsv(rows: Claim[], quest: QuestRow[]): string {
  const title = new Map(quest.map((q) => [q.quest_code, q.title]));
  const esc = (v: string | number | boolean) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["challenge", "name", "signed_in", "status", "points", "species", "claimed_at", "checked_by"];
  return [
    head.join(","),
    ...rows.map((c) => [title.get(c.quest_code) ?? c.quest_code, c.display_name, c.is_signed_in, c.status, c.point, c.species_code ?? "", c.created_at, c.decided_by ?? "server"].map(esc).join(",")),
  ].join("\n");
}

export default function SeedsConsole() {
  const [token, setToken] = useState(readToken);
  const [draft_token, setDraftToken] = useState("");
  const [load, setLoad] = useState<Load>(() => (readToken() ? { status: "loading" } : { status: "locked", error: null }));
  const [show_code, setShowCode] = useState<QuestRow | null>(null);

  const answer = useCallback(async (res: Response): Promise<SeedsState | null> => {
    const body = (await res.json().catch(() => ({}))) as { error?: string; state?: SeedsState } & Partial<SeedsState>;
    if (res.status === 404 && typeof body.error === "string" && body.error.includes("off")) {
      setLoad({ status: "off", error: body.error });
      return null;
    }
    if (res.status === 401 || res.status === 429) {
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        /* private mode */
      }
      setToken("");
      setLoad({ status: "locked", error: body.error ?? "Wrong token." });
      return null;
    }
    if (!res.ok) {
      setLoad((prev) => (prev.status === "ready" ? { ...prev, error: body.error ?? `HTTP ${res.status}` } : { status: "locked", error: body.error ?? `HTTP ${res.status}` }));
      return null;
    }
    return (body.state ?? body) as SeedsState;
  }, []);

  const refresh = useCallback(
    async (with_token: string) => {
      try {
        const state = await answer(await fetch("/seeds/api/state", { headers: { Authorization: `Bearer ${with_token}` }, cache: "no-store" }));
        if (state) setLoad({ status: "ready", state, error: null });
      } catch {
        setLoad({ status: "locked", error: "The server is not reachable." });
      }
    },
    [answer],
  );

  useEffect(() => {
    if (!token) return;
    void refresh(token);
    const timer = setInterval(() => void refresh(token), 20_000);
    return () => clearInterval(timer);
  }, [token, refresh]);

  async function act(body: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await fetch("/seeds/api/action", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 400) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Refused.";
      const state = await answer(res);
      if (state) setLoad({ status: "ready", state, error: null });
      return null;
    } catch {
      return "The server is not reachable.";
    }
  }

  if (show_code) return <SiteCodeScreen quest={show_code} onBack={() => setShowCode(null)} />;

  if (load.status === "off") {
    return (
      <main style={S.page}>
        <h1 style={{ margin: 0 }}>SEEDS challenges</h1>
        <p>The SEEDS console is off on this server. Set SEEDS_TOKEN (16+ characters) to turn it on.</p>
      </main>
    );
  }
  if (load.status !== "ready") {
    return (
      <main style={S.page}>
        <h1 style={{ margin: "0 0 6px" }}>SEEDS challenges</h1>
        <p style={S.dim}>For the AVP-SEEDS office, teachers and orgs: set field challenges students complete on campus, judged by the server.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const next = draft_token.trim();
            if (!next) return;
            try {
              sessionStorage.setItem(TOKEN_KEY, next);
            } catch {
              /* memory only */
            }
            setToken(next);
            setLoad({ status: "loading" });
          }}
        >
          <input type="password" value={draft_token} onChange={(e) => setDraftToken(e.target.value)} placeholder="Organiser token" aria-label="Organiser token" style={{ ...S.input, width: 280 }} />
          <button type="submit" style={{ ...S.btn, ...S.primary, marginLeft: 6 }}>
            Open
          </button>
        </form>
        {load.status === "locked" && load.error && <p style={{ color: "#B3261E" }}>{load.error}</p>}
      </main>
    );
  }

  const { state } = load;
  const review = state.claim.filter((c) => c.status === "review");
  return (
    <main style={S.page}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>SEEDS challenges</h1>
        <span style={S.dim}>signed in as {state.actor}</span>
        <button
          type="button"
          style={{ ...S.btn, marginLeft: "auto" }}
          onClick={() => {
            try {
              sessionStorage.removeItem(TOKEN_KEY);
            } catch {
              /* */
            }
            setToken("");
            setLoad({ status: "locked", error: null });
          }}
        >
          Lock
        </button>
      </div>
      {load.error && <p style={{ color: "#B3261E" }}>{load.error}</p>}

      <CreateForm onCreate={(quest) => act({ action: "create", quest })} />

      <Section title={`Needs a person (${review.length})`} note="Claims the server could not wave through: a vague or frozen GPS, faster than walking, or from a walker with voided claims. Approve pays the points; Void is a strike — two strikes and every later claim from that walker comes here.">
        {review.length === 0 ? <p style={S.dim}>Nothing waiting.</p> : <ClaimTable rows={review} quest={state.quest} onAct={(action, claim_id) => void act({ action, target: claim_id })} />}
      </Section>

      <Section title="Challenges">
        {state.quest.length === 0 && <p style={S.dim}>None yet.</p>}
        {state.quest.map((q) => (
          <div key={q.quest_code} style={{ borderTop: "1px solid rgba(18,50,74,0.1)", padding: "8px 0" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong>{q.title}</strong>
              <span style={S.dim}>
                {QUEST_KIND_LABEL[q.quest_kind]}
                {q.site ? ` · ${q.site.name}, ${q.site.radius_m} m` : " · anywhere on campus"} · +{q.point} · {when(q.start_at)} → {when(q.end_at)}
                {q.class_code ? ` · class ${q.class_code}` : " · everyone"} · {q.status}
              </span>
            </div>
            <div style={{ ...S.dim, margin: "2px 0 6px" }}>
              {q.claim_count.accepted} verified · {q.claim_count.review} waiting · {q.claim_count.void} voided
              {q.is_site_code ? " · site code on" : ""}
              {q.is_photo ? " · photo required" : ""}
            </div>
            {q.is_site_code && (
              <button type="button" style={{ ...S.btn, ...S.primary }} onClick={() => setShowCode(q)}>
                Show site code
              </button>
            )}
            <button
              type="button"
              style={S.btn}
              onClick={() => {
                const rows = state.claim.filter((c) => c.quest_code === q.quest_code);
                const blob = new Blob([claimCsv(rows, state.quest)], { type: "text/csv" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `seeds-${q.quest_code}.csv`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              Export claims (CSV)
            </button>
            {q.status === "open" && (
              <button type="button" style={{ ...S.btn, ...S.danger }} onClick={() => void act({ action: "close", target: q.quest_code })}>
                Close
              </button>
            )}
          </div>
        ))}
      </Section>

      <Section title="All claims" note="Newest first. Names are what the student's phone showed; a signed-in student also counts once per account.">
        <ClaimTable rows={state.claim.slice(0, 120)} quest={state.quest} onAct={(action, claim_id) => void act({ action, target: claim_id })} />
      </Section>

      {state.strike.length > 0 && (
        <Section title="Walkers with voided claims">
          {state.strike.map((s) => (
            <div key={s.walker_id} style={S.dim}>
              {s.display_name} — {s.count} voided
            </div>
          ))}
        </Section>
      )}

      <Section title="Audit log" note="Every create, close, approve and void, by whom. It cannot be edited — not by this page, not by the database.">
        {state.audit.slice(0, 40).map((a, i) => (
          <div key={i} style={{ ...S.dim, fontFamily: "ui-monospace, monospace" }}>
            {when(a.at)} · {a.actor} · {a.action} · {a.detail}
          </div>
        ))}
      </Section>
    </main>
  );
}

function ClaimTable({ rows, quest, onAct }: { rows: Claim[]; quest: QuestRow[]; onAct: (action: "approve" | "void", claim_id: string) => void }) {
  const title = new Map(quest.map((q) => [q.quest_code, q.title]));
  if (!rows.length) return <p style={S.dim}>No claims yet.</p>;
  return (
    <table style={S.table}>
      <tbody>
        {rows.map((c) => (
          <tr key={c.claim_id}>
            <td style={S.td}>
              <strong>{c.display_name}</strong>
              {c.is_signed_in ? " ✓" : ""}
              <div style={S.dim}>{title.get(c.quest_code) ?? c.quest_code}</div>
            </td>
            <td style={S.td}>
              {c.species_code ? species[c.species_code]?.common_name ?? c.species_code : "—"}
              <div style={S.dim}>
                ±{Math.round(c.accuracy_m)} m · {when(c.created_at)}
              </div>
            </td>
            <td style={{ ...S.td, color: c.status === "accepted" ? "#1B7F3B" : c.status === "review" ? "#B06A00" : "#B3261E", fontWeight: 800 }}>
              {c.status === "accepted" ? `verified +${c.point}` : c.status}
              {c.reason.length > 0 && <div style={{ ...S.dim, fontWeight: 400 }}>{c.reason.join(" ")}</div>}
            </td>
            <td style={S.td}>
              {c.status !== "accepted" && (
                <button type="button" style={S.btn} onClick={() => onAct("approve", c.claim_id)}>
                  Approve
                </button>
              )}
              {c.status !== "void" && (
                <button type="button" style={{ ...S.btn, ...S.danger }} onClick={() => onAct("void", c.claim_id)}>
                  Void
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CreateForm({ onCreate }: { onCreate: (quest: Record<string, unknown>) => Promise<string | null> }) {
  const place = useMemo(placeList, []);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<QuestKind>("log_any");
  const [pick, setPick] = useState<string[]>([]);
  const [place_key, setPlaceKey] = useState<string>("");
  const [radius, setRadius] = useState(40);
  const [here, setHere] = useState<QuestSite | null>(null);
  const [hour, setHour] = useState(2);
  const [point, setPoint] = useState(50);
  const [is_site_code, setSiteCode] = useState(true);
  const [is_photo, setPhoto] = useState(true);
  const [is_account, setAccount] = useState<boolean | null>(null);
  const [class_code, setClassCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const site: QuestSite | null =
    place_key === "here" ? (here ? { ...here, radius_m: radius } : null) : place_key ? (() => {
      const p = place.find((x) => x.key === place_key);
      return p ? { lat: p.lat, lon: p.lon, name: p.name, radius_m: radius } : null;
    })() : null;
  return (
    <Section title="New challenge" note="Students see it in To do → SEEDS challenges. A site code makes them be at the place: you show the code there, it changes every 30 seconds.">
      <label style={S.label}>Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Find a native tree by the library" style={{ ...S.input, width: "100%" }} />
      <label style={S.label}>Brief (what to look for, why)</label>
      <textarea value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={600} rows={2} style={{ ...S.input, width: "100%" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0 14px" }}>
        <div>
          <label style={S.label}>Asks for</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as QuestKind)} style={{ ...S.input, width: "100%" }}>
            {QUEST_KIND.map((k) => (
              <option key={k} value={k}>
                {QUEST_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>Where</label>
          <select
            value={place_key}
            onChange={(e) => {
              setPlaceKey(e.target.value);
              if (e.target.value === "here") {
                navigator.geolocation?.getCurrentPosition(
                  (pos) => setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude, radius_m: radius, name: "the marked spot" }),
                  () => setMessage("This device would not share its position."),
                  { enableHighAccuracy: true, timeout: 15000 },
                );
              }
            }}
            style={{ ...S.input, width: "100%" }}
          >
            <option value="">Anywhere on campus</option>
            <option value="here">Right here (this device's position)</option>
            {place.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>Counts within (m)</label>
          <input type="number" min={10} max={500} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ ...S.input, width: "100%" }} />
        </div>
        <div>
          <label style={S.label}>Open for (hours, from now)</label>
          <input type="number" min={1} max={2880} value={hour} onChange={(e) => setHour(Number(e.target.value))} style={{ ...S.input, width: "100%" }} />
        </div>
        <div>
          <label style={S.label}>Points</label>
          <input type="number" min={0} max={200} value={point} onChange={(e) => setPoint(Number(e.target.value))} style={{ ...S.input, width: "100%" }} />
        </div>
        <div>
          <label style={S.label}>Class code (blank: everyone)</label>
          <input value={class_code} onChange={(e) => setClassCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} placeholder="BIO101" style={{ ...S.input, width: "100%" }} />
        </div>
      </div>
      {kind === "log_species" && (
        <>
          <label style={S.label}>Species (any one counts)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.values(species).map((sp) => (
              <label key={sp.species_code} style={{ fontSize: 12.5, border: "1px solid rgba(18,50,74,0.2)", borderRadius: 999, padding: "3px 9px", background: pick.includes(sp.species_code) ? "#DCEBFA" : "#fff" }}>
                <input
                  type="checkbox"
                  checked={pick.includes(sp.species_code)}
                  onChange={(e) => setPick((prev) => (e.target.checked ? [...prev, sp.species_code] : prev.filter((c) => c !== sp.species_code)))}
                  style={{ marginRight: 4 }}
                />
                {sp.common_name}
              </label>
            ))}
          </div>
        </>
      )}
      <div style={{ margin: "10px 0" }}>
        <label style={{ marginRight: 14 }}>
          <input type="checkbox" checked={is_site_code} onChange={(e) => setSiteCode(e.target.checked)} /> Site code (you show it at the place)
        </label>
        <label style={{ marginRight: 14 }}>
          <input type="checkbox" checked={is_photo} onChange={(e) => setPhoto(e.target.checked)} /> Photo required
        </label>
        <label>
          <input type="checkbox" checked={is_account ?? Boolean(class_code)} onChange={(e) => setAccount(e.target.checked)} /> Students must be signed in (one claim per student)
        </label>
      </div>
      <button
        type="button"
        style={{ ...S.btn, ...S.primary }}
        onClick={async () => {
          const now = Date.now();
          const error = await onCreate({
            title,
            brief,
            quest_kind: kind,
            species_code: pick,
            site,
            start_at: new Date(now).toISOString(),
            end_at: new Date(now + Math.max(1, hour) * 3600_000).toISOString(),
            point,
            is_site_code,
            is_photo,
            class_code: class_code || null,
            is_account: is_account ?? Boolean(class_code),
          });
          setMessage(error ?? `Created “${title}”.`);
          if (!error) {
            setTitle("");
            setBrief("");
          }
        }}
      >
        Create challenge
      </button>
      {message && <span style={{ ...S.dim, marginLeft: 8 }}>{message}</span>}
    </Section>
  );
}

/** Full screen, big digits, for a phone or a projector at the site. Works offline. */
function SiteCodeScreen({ quest, onBack }: { quest: QuestRow; onBack: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState("······");
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const step = Math.floor(now / 30_000);
  useEffect(() => {
    let is_live = true;
    void siteCodeAt(quest.secret, step * 30_000).then((c) => is_live && setCode(c));
    return () => {
      is_live = false;
    };
  }, [quest.secret, step]);
  const left = siteCodeSecondLeft(now);
  return (
    <main style={{ ...S.page, background: "#0E2A44", color: "#fff", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 18, opacity: 0.8 }}>{quest.title}</div>
        {quest.site && <div style={{ fontSize: 14, opacity: 0.6 }}>at {quest.site.name}</div>}
        <div style={{ fontSize: "clamp(56px, 16vw, 160px)", fontWeight: 900, letterSpacing: "0.12em", fontVariantNumeric: "tabular-nums", margin: "18px 0" }} aria-live="polite">
          {code.slice(0, 3)} {code.slice(3)}
        </div>
        <div style={{ width: "min(420px, 70vw)", height: 8, borderRadius: 999, background: "rgba(255,255,255,0.2)", margin: "0 auto", overflow: "hidden" }}>
          <div style={{ width: `${(left / 30) * 100}%`, height: "100%", background: "#F0B429", transition: "width 0.5s linear" }} />
        </div>
        <p style={{ opacity: 0.75 }}>
          New code in {left} s. Students type it in To do → SEEDS challenges → Claim. A code works for about a minute, so a photo of it sent elsewhere is soon useless.
        </p>
        <button type="button" onClick={onBack} style={{ ...S.btn, marginTop: 10, color: "#12324A" }}>
          Back
        </button>
      </div>
    </main>
  );
}
