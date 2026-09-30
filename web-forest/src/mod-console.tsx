import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { REPORT_CATEGORY_LABEL, REPORT_SEVERITY_LABEL, type ModAction, type Report } from "./moderation";

/**
 * The moderator console at `/mod` — the authority half of moderation
 * (`docs/spec/moderation.md`).
 *
 * A page of the app, not a second app: `main.tsx` renders this instead of the
 * game when the path is `/mod`. It asks for the MOD_TOKEN, keeps it in
 * sessionStorage (gone when the tab closes, never in localStorage), and talks
 * to `/mod/api/*` on this same origin with it as a Bearer token. The server
 * decides everything; with no MOD_TOKEN configured it answers 404 and this page
 * says the console is off.
 *
 * What it shows is what the API returns, and the API returns nothing personal
 * beyond a display name: walkers by `walker_id` (a one-way hash), reports with
 * no reporter identity at all.
 */

const TOKEN_KEY = "field-guide.mod-token";

interface ModState {
  retention_day: number;
  you: string;
  activity: { week_key: string; walker_count: number; returning_count: number; find_count: number }[];
  report: Report[];
  hidden_walker: { walker_id: string; walker_name: string | null; until_at: number }[];
  hidden_find: { sighting_id: string; created_at: string }[];
  walker: { walker_id: string; name: string; level: number }[];
  find: {
    sighting_id: string;
    walker_id: string;
    player_name: string;
    species_code: string;
    common_name: string;
    created_at: string;
    is_hidden: boolean;
  }[];
  audit: { audit_id: number; at: string; action: string; target: string; detail: string; actor: string }[];
}

type Load =
  | { status: "locked"; error: string | null }
  | { status: "off"; error: string }
  | { status: "loading" }
  | { status: "ready"; state: ModState; error: string | null };

const S: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#F4F6F1",
    color: "#1B2E16",
    font: "14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif",
    padding: "20px clamp(12px, 4vw, 40px) 60px",
    overflowY: "auto",
    height: "100vh",
    boxSizing: "border-box",
  },
  card: { background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.12)", marginTop: 14 },
  h2: { margin: "0 0 8px", fontSize: 15, fontWeight: 900 },
  dim: { color: "rgba(27,46,22,0.6)", fontSize: 12 },
  btn: {
    padding: "5px 10px",
    borderRadius: 8,
    border: "1px solid rgba(27,46,22,0.25)",
    background: "#fff",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    marginRight: 6,
  },
  danger: { borderColor: "#B3261E", color: "#B3261E" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  td: { borderTop: "1px solid rgba(27,46,22,0.1)", padding: "7px 6px", verticalAlign: "top" },
};

const SEVERITY_TONE: Record<string, string> = { blocker: "#B3261E", major: "#B06A00", minor: "#4A6B45" };

function when(iso: string | number): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? String(iso) : at.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
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

export default function ModConsole() {
  const [token, setToken] = useState(readToken);
  const [draft, setDraft] = useState("");
  const [load, setLoad] = useState<Load>(() => (readToken() ? { status: "loading" } : { status: "locked", error: null }));
  const [hour, setHour] = useState(24);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");

  const answer = useCallback(async (res: Response): Promise<ModState | null> => {
    const body = (await res.json().catch(() => ({}))) as { error?: string; state?: ModState } & Partial<ModState>;
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
    return (body.state ?? body) as ModState;
  }, []);

  const refresh = useCallback(
    async (with_token: string) => {
      try {
        const res = await fetch("/mod/api/state", { headers: { Authorization: `Bearer ${with_token}` }, cache: "no-store" });
        const state = await answer(res);
        if (state) setLoad({ status: "ready", state, error: null });
      } catch {
        setLoad({ status: "locked", error: "The server is not reachable." });
      }
    },
    [answer],
  );

  useEffect(() => {
    if (token) void refresh(token);
  }, [token, refresh]);

  async function act(action: ModAction, target: string, extra: { hour?: number } = {}) {
    try {
      const res = await fetch("/mod/api/action", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, target, ...extra }),
      });
      const state = await answer(res);
      if (state) setLoad({ status: "ready", state, error: null });
    } catch {
      setLoad((prev) => (prev.status === "ready" ? { ...prev, error: "The server is not reachable." } : prev));
    }
  }

  function unlock() {
    const next = draft.trim();
    if (!next) return;
    try {
      sessionStorage.setItem(TOKEN_KEY, next);
    } catch {
      /* private mode: held in memory for this page only */
    }
    setDraft("");
    setLoad({ status: "loading" });
    setToken(next);
  }

  function lock() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode */
    }
    setToken("");
    setLoad({ status: "locked", error: null });
  }

  const head = (
    <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Magisphere · moderator console</h1>
      {load.status === "ready" && (
        <>
          <span style={S.dim}>signed in as {load.state.you}</span>
          <button type="button" style={S.btn} onClick={() => void refresh(token)}>
            Refresh
          </button>
          <button type="button" style={S.btn} onClick={lock}>
            Lock
          </button>
        </>
      )}
      <a href="/" style={{ ...S.dim, marginLeft: "auto" }}>
        Back to the app
      </a>
    </header>
  );

  if (load.status === "off") {
    return (
      <main style={S.page}>
        {head}
        <section style={S.card}>
          <h2 style={S.h2}>The console is off on this server</h2>
          <p>
            Nobody has set a moderator token here. On the deployed Worker: <code>npx wrangler secret put MOD_TOKEN</code>{" "}
            (16+ characters, e.g. <code>openssl rand -hex 24</code>). On the LAN box: <code>MOD_TOKEN=… npm run sync</code>.
          </p>
        </section>
      </main>
    );
  }

  if (load.status !== "ready") {
    return (
      <main style={S.page}>
        {head}
        <form
          style={{ ...S.card, maxWidth: 420 }}
          onSubmit={(e) => {
            e.preventDefault();
            unlock();
          }}
        >
          <h2 style={S.h2}>Moderator token</h2>
          <p style={S.dim}>Kept for this tab only. Ten wrong tries lock this network out for fifteen minutes.</p>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            aria-label="Moderator token"
            style={{ width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 8, border: "1px solid rgba(27,46,22,0.3)", marginTop: 6 }}
          />
          {load.status === "locked" && load.error && <p style={{ color: "#B3261E", fontWeight: 700 }}>{load.error}</p>}
          <button type="submit" style={{ ...S.btn, marginTop: 10 }} disabled={load.status === "loading"}>
            {load.status === "loading" ? "Checking…" : "Open console"}
          </button>
        </form>
      </main>
    );
  }

  const { state } = load;
  const report = state.report.filter((r) => filter === "all" || r.status === filter);
  const open_count = state.report.filter((r) => r.status === "open").length;
  const hidden_id = new Set(state.hidden_walker.map((w) => w.walker_id));

  const hideButton = (walker_id: string) =>
    hidden_id.has(walker_id) ? (
      <button type="button" style={S.btn} onClick={() => void act("unhide_walker", walker_id)}>
        Unhide from hall
      </button>
    ) : (
      <button type="button" style={{ ...S.btn, ...S.danger }} onClick={() => void act("hide_walker", walker_id, { hour })}>
        Hide from hall {hour} h
      </button>
    );

  return (
    <main style={S.page}>
      {head}
      <p style={{ ...S.dim, marginTop: 6 }}>
        Reports are deleted {state.retention_day} days after they are filed. Every action below is written to the audit
        log, which cannot be edited. Walkers are shown by display name and hall id only.
      </p>
      {load.error && <p style={{ color: "#B3261E", fontWeight: 700 }}>{load.error}</p>}

      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, fontWeight: 700 }}>
        Hide for
        <input
          type="number"
          min={1}
          max={168}
          value={hour}
          onChange={(e) => setHour(Math.max(1, Math.min(168, Math.round(Number(e.target.value) || 1))))}
          style={{ width: 64, padding: 4, borderRadius: 6, border: "1px solid rgba(27,46,22,0.3)" }}
        />
        hours
      </label>

      <Section
        title="Walkers by week"
        note="Walkers who shared at least one find that week, and how many had shared one before. Counted from the finds already shared — nothing else is collected, and nobody is named. Anyone who walked without logging is not counted, so this is a floor."
      >
        {state.activity.length === 0 ? (
          <p style={S.dim}>No shared finds yet.</p>
        ) : (
          <table style={S.table}>
            <tbody>
              <tr>
                <td style={{ ...S.td, fontWeight: 700 }}>Week</td>
                <td style={{ ...S.td, fontWeight: 700 }}>Walkers</td>
                <td style={{ ...S.td, fontWeight: 700 }}>Returning</td>
                <td style={{ ...S.td, fontWeight: 700 }}>Finds</td>
              </tr>
              {state.activity.map((w) => (
                <tr key={w.week_key}>
                  <td style={S.td}>{w.week_key}</td>
                  <td style={S.td}>{w.walker_count}</td>
                  <td style={S.td}>{w.returning_count}</td>
                  <td style={S.td}>{w.find_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Reports · ${open_count} open`}>
        <div style={{ marginBottom: 8 }}>
          {(["open", "resolved", "all"] as const).map((one) => (
            <button
              key={one}
              type="button"
              aria-pressed={filter === one}
              onClick={() => setFilter(one)}
              style={{ ...S.btn, background: filter === one ? "#DDEFD8" : "#fff" }}
            >
              {one}
            </button>
          ))}
        </div>
        {report.length === 0 ? (
          <p style={S.dim}>Nothing here.</p>
        ) : (
          <table style={S.table}>
            <tbody>
              {report.map((r) => (
                <tr key={r.report_id}>
                  <td style={{ ...S.td, width: 150 }}>
                    <div style={{ fontWeight: 800 }}>{REPORT_CATEGORY_LABEL[r.category] ?? r.category}</div>
                    <div style={{ color: SEVERITY_TONE[r.severity], fontWeight: 800, fontSize: 12 }}>
                      {REPORT_SEVERITY_LABEL[r.severity] ?? r.severity}
                    </div>
                    <div style={S.dim}>{when(r.created_at)}</div>
                    <div style={S.dim}>{r.status === "resolved" ? `resolved ${when(r.resolved_at ?? "")}` : "open"}</div>
                  </td>
                  <td style={S.td}>
                    {r.text && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.text}</div>}
                    {r.walker_id && (
                      <div style={{ marginTop: 4 }}>
                        Walker <strong>{r.walker_name ?? "(no name)"}</strong> <code style={S.dim}>{r.walker_id}</code>
                      </div>
                    )}
                    {r.sighting_id && (
                      <div style={S.dim}>
                        Find <code>{r.sighting_id}</code>
                      </div>
                    )}
                    <details style={{ ...S.dim, marginTop: 4 }}>
                      <summary style={{ cursor: "pointer" }}>
                        {r.diagnostic.build_id} · {r.diagnostic.viewport} · {r.diagnostic.fps ?? "–"} fps · hall {r.diagnostic.hall_mode} ·{" "}
                        {r.diagnostic.geo_source}
                      </summary>
                      <div style={{ wordBreak: "break-word" }}>{r.diagnostic.user_agent}</div>
                      <div>
                        p95 {r.diagnostic.p95_ms ?? "–"} ms · long frames {r.diagnostic.long_count ?? "–"} · screen {r.diagnostic.route}
                        {r.diagnostic.lat !== undefined && ` · at ${r.diagnostic.lat}, ${r.diagnostic.lon}`}
                      </div>
                    </details>
                    <div style={{ marginTop: 6 }}>
                      {r.status === "open" ? (
                        <button type="button" style={S.btn} onClick={() => void act("resolve_report", r.report_id)}>
                          Resolve
                        </button>
                      ) : (
                        <button type="button" style={S.btn} onClick={() => void act("reopen_report", r.report_id)}>
                          Reopen
                        </button>
                      )}
                      {r.walker_id && hideButton(r.walker_id)}
                      {r.sighting_id && (
                        <button type="button" style={{ ...S.btn, ...S.danger }} onClick={() => void act("hide_find", r.sighting_id!)}>
                          Hide find
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`In the hall now · ${state.walker.length}`} note="Everyone whose name is printed on other phones right now.">
        {state.walker.length === 0 ? (
          <p style={S.dim}>Nobody is out.</p>
        ) : (
          <table style={S.table}>
            <tbody>
              {state.walker.map((w) => (
                <tr key={w.walker_id}>
                  <td style={S.td}>
                    <strong>{w.name}</strong> · Lv {w.level} <code style={S.dim}>{w.walker_id}</code>
                  </td>
                  <td style={{ ...S.td, textAlign: "right" }}>{hideButton(w.walker_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Hidden from the hall · ${state.hidden_walker.length}`}>
        {state.hidden_walker.length === 0 ? (
          <p style={S.dim}>Nobody is hidden.</p>
        ) : (
          <table style={S.table}>
            <tbody>
              {state.hidden_walker.map((w) => (
                <tr key={w.walker_id}>
                  <td style={S.td}>
                    <strong>{w.walker_name ?? "(no name)"}</strong> <code style={S.dim}>{w.walker_id}</code>
                    <div style={S.dim}>until {when(w.until_at)}</div>
                  </td>
                  <td style={{ ...S.td, textAlign: "right" }}>
                    <button type="button" style={S.btn} onClick={() => void act("unhide_walker", w.walker_id)}>
                      Unhide
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Shared finds (last six hours)" note="What “… logged …” shows on every phone. Hiding a find takes it off the map and the feed; it is not deleted.">
        {state.find.length === 0 ? (
          <p style={S.dim}>No shared finds.</p>
        ) : (
          <table style={S.table}>
            <tbody>
              {state.find.map((f) => (
                <tr key={f.sighting_id} style={{ opacity: f.is_hidden ? 0.55 : 1 }}>
                  <td style={S.td}>
                    <strong>{f.player_name}</strong> logged {f.common_name || f.species_code}
                    <div style={S.dim}>
                      {when(f.created_at)} · <code>{f.sighting_id}</code> · walker <code>{f.walker_id}</code>
                    </div>
                  </td>
                  <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {f.is_hidden ? (
                      <button type="button" style={S.btn} onClick={() => void act("unhide_find", f.sighting_id)}>
                        Unhide find
                      </button>
                    ) : (
                      <button type="button" style={{ ...S.btn, ...S.danger }} onClick={() => void act("hide_find", f.sighting_id)}>
                        Hide find
                      </button>
                    )}
                    {hideButton(f.walker_id)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Audit log" note="Append-only: when, who, what, to whom. The newest 200.">
        {state.audit.length === 0 ? (
          <p style={S.dim}>No actions yet.</p>
        ) : (
          <table style={S.table}>
            <tbody>
              {state.audit.map((a) => (
                <tr key={a.audit_id}>
                  <td style={{ ...S.td, width: 170 }}>{when(a.at)}</td>
                  <td style={{ ...S.td, width: 110 }}>{a.actor || <span style={S.dim}>—</span>}</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{a.action}</td>
                  <td style={S.td}>
                    <code>{a.target}</code> {a.detail && <span style={S.dim}>· {a.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </main>
  );
}
