import { useEffect, useState, type CSSProperties } from "react";
import { frameStat, type FrameStat } from "./frame-stat";
import {
  REPORT_CATEGORY_LABEL,
  REPORT_CATEGORY_PICK,
  REPORT_SEVERITY,
  REPORT_SEVERITY_LABEL,
  REPORT_TEXT_MAX,
  type ReportCategory,
  type ReportInput,
  type ReportSeverity,
} from "./moderation";
import { onMuteChange, readMuted } from "./mute";
import {
  buildIdOf,
  diagnosticLine,
  diagnosticOf,
  flushQueue,
  readQueue,
  REPORT_RETRY_MS,
  reportContext,
  sendReport,
  type ReportIo,
  type SendResult,
} from "./report";
import { syncRouteOf } from "./sync";

/**
 * The "Report a problem" form — in Settings (Setup panel) and on the buddy
 * sheet the play HUD opens — plus the one-tap name report a walker's name tag
 * sends. The flow is Gelo's (09-30 note `3:39`): what kind of problem, how
 * bad, a few words; the diagnostics ride along and are listed on the form
 * before anything is sent.
 */

const TONE = {
  card: "var(--mg-surface)",
  edge: "rgb(var(--mg-ink-rgb) / 0.12)",
  text: "rgb(var(--mg-ink-rgb) / 0.92)",
  dim: "rgb(var(--mg-ink-rgb) / 0.62)",
  green: "var(--mg-green)",
  green_soft: "rgba(62,154,74,0.12)",
};

/** POST /report on the same base the campus world uses. No cookie: a report is anonymous. */
export function reportIo(): ReportIo {
  return { fetch: (input, init) => fetch(input, init), url: syncRouteOf("/report").url, credentials: "omit" };
}

/** A second of frame times, measured when the form opens — the "is it stuttering" number. */
export function sampleFrame(ms = 1000): Promise<FrameStat | null> {
  if (typeof requestAnimationFrame === "undefined") return Promise.resolve(null);
  return new Promise((done) => {
    const delta: number[] = [];
    let last = performance.now();
    const start = last;
    const step = (now: number) => {
      delta.push(now - last);
      last = now;
      if (now - start < ms) requestAnimationFrame(step);
      else done(frameStat(delta));
    };
    requestAnimationFrame(step);
  });
}

function routeNow(): string {
  try {
    return window.location.pathname;
  } catch {
    return "/";
  }
}

/** Retry the offline queue: now, whenever the browser is back online, and every minute while any wait. */
export function startReportRetry(): () => void {
  if (typeof window === "undefined") return () => {};
  let is_busy = false;
  const flush = () => {
    if (is_busy || !readQueue().length) return;
    is_busy = true;
    void flushQueue(reportIo()).finally(() => {
      is_busy = false;
    });
  };
  flush();
  window.addEventListener("online", flush);
  const timer = setInterval(flush, REPORT_RETRY_MS);
  return () => {
    window.removeEventListener("online", flush);
    clearInterval(timer);
  };
}

/** The walkers this phone has hidden, live. */
export function useMuted(): Set<string> {
  const [muted, setMuted] = useState(() => readMuted());
  useEffect(() => onMuteChange(() => setMuted(readMuted())), []);
  return muted;
}

export const RESULT_LINE: Record<SendResult, string> = {
  sent: "Sent — thank you. A moderator reads every report.",
  queued: "No connection right now — saved on this phone and sent when you're back online.",
  refused: "The server would not take that report. Add a few more words and try again.",
};

/** File a report now (or queue it), with the diagnostics attached. */
export async function fileReport(
  draft: Omit<ReportInput, "diagnostic">,
  frame: FrameStat | null = null,
): Promise<SendResult> {
  const env = {
    build_id: buildIdOf(),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    route: routeNow(),
    frame,
  };
  return sendReport({ ...draft, diagnostic: diagnosticOf(reportContext(), env, draft.is_location_shared) }, reportIo());
}

const CHIP = (is_on: boolean): CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: `1.5px solid ${is_on ? TONE.green : TONE.edge}`,
  background: is_on ? TONE.green_soft : "transparent",
  color: is_on ? "var(--mg-green-text)" : TONE.dim,
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
});

export function ReportForm({ onDone }: { onDone?: (result: SendResult) => void }) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [severity, setSeverity] = useState<ReportSeverity | null>(null);
  const [text, setText] = useState("");
  const [is_location_shared, setLocationShared] = useState(false);
  const [frame, setFrame] = useState<FrameStat | null>(null);
  const [is_busy, setBusy] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [queued_count, setQueuedCount] = useState(() => readQueue().length);

  useEffect(() => {
    let is_live = true;
    void sampleFrame().then((stat) => {
      if (is_live) setFrame(stat);
    });
    return () => {
      is_live = false;
    };
  }, []);

  const ctx = reportContext();
  const preview = diagnosticOf(
    ctx,
    {
      build_id: buildIdOf(),
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      width: typeof window !== "undefined" ? window.innerWidth : 0,
      height: typeof window !== "undefined" ? window.innerHeight : 0,
      dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      route: routeNow(),
      frame,
    },
    is_location_shared,
  );
  const is_ready = category !== null && severity !== null && text.trim().length >= 3 && !is_busy;

  async function submit() {
    if (!category || !severity) return;
    setBusy(true);
    const sent = await fileReport({ category, severity, text, is_location_shared }, frame);
    setBusy(false);
    setResult(sent);
    setQueuedCount(readQueue().length);
    if (sent !== "refused") {
      setCategory(null);
      setSeverity(null);
      setText("");
      setLocationShared(false);
    }
    onDone?.(sent);
  }

  return (
    <div style={{ display: "grid", gap: 10, color: TONE.text }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>1 · What went wrong?</div>
        <div role="radiogroup" aria-label="Kind of problem" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {REPORT_CATEGORY_PICK.map((one) => (
            <button key={one} type="button" role="radio" aria-checked={category === one} onClick={() => setCategory(one)} style={CHIP(category === one)}>
              {REPORT_CATEGORY_LABEL[one]}
            </button>
          ))}
        </div>
      </div>
      {category && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>2 · How bad?</div>
          <div role="radiogroup" aria-label="Severity" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {REPORT_SEVERITY.map((one) => (
              <button key={one} type="button" role="radio" aria-checked={severity === one} onClick={() => setSeverity(one)} style={CHIP(severity === one)}>
                {REPORT_SEVERITY_LABEL[one]}
              </button>
            ))}
          </div>
        </div>
      )}
      {category && severity && (
        <>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>3 · What happened? ({text.length}/{REPORT_TEXT_MAX})</span>
            <textarea
              value={text}
              maxLength={REPORT_TEXT_MAX}
              onChange={(e) => setText(e.target.value.slice(0, REPORT_TEXT_MAX))}
              rows={4}
              placeholder="What you did, what you saw, and what you expected."
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 10,
                border: `1.5px solid ${TONE.edge}`,
                padding: 8,
                font: "inherit",
                fontSize: 13,
                background: TONE.card,
                color: TONE.text,
                resize: "vertical",
              }}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: TONE.dim }}>
            <input type="checkbox" checked={is_location_shared} onChange={(e) => setLocationShared(e.target.checked)} />
            <span>
              Attach my map position (rounded to about 11 m, only if it is on campus). Helps with a “wrong place” report.
            </span>
          </label>
        </>
      )}
      <details style={{ fontSize: 11.5, color: TONE.dim }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>What gets sent with it</summary>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6, tableLayout: "fixed" }}>
          <tbody>
            {diagnosticLine(preview).map((row) => (
              <tr key={row.label}>
                <td style={{ width: "34%", padding: "2px 6px 2px 0", fontWeight: 700, verticalAlign: "top" }}>{row.label}</td>
                <td style={{ padding: "2px 0", wordBreak: "break-word" }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: "6px 0 0" }}>
          Never sent: your photos, notes, journal, or any id that links this report to you. No IP address is kept.
          Reports are deleted after 30 days.
        </p>
      </details>
      <button
        type="button"
        disabled={!is_ready}
        onClick={() => void submit()}
        style={{
          justifySelf: "start",
          padding: "8px 16px",
          borderRadius: 999,
          border: "none",
          background: is_ready ? TONE.green : TONE.edge,
          color: is_ready ? "#fff" : TONE.dim,
          fontWeight: 800,
          fontSize: 13,
          cursor: is_ready ? "pointer" : "not-allowed",
        }}
      >
        {is_busy ? "Sending…" : "Send report"}
      </button>
      {result && (
        <p role="status" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: result === "refused" ? "#B3261E" : "var(--mg-green-text)" }}>
          {RESULT_LINE[result]}
        </p>
      )}
      {queued_count > 0 && (
        <p style={{ margin: 0, fontSize: 11.5, color: TONE.dim }}>
          {queued_count} report{queued_count === 1 ? "" : "s"} waiting to send.
        </p>
      )}
    </div>
  );
}

/** The form as a bottom sheet, for the buddy sheet on the play view. */
export function ReportSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(10,20,10,0.35)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Report a problem"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "86%",
          overflowY: "auto",
          background: "var(--mg-surface)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: "14px 18px 28px",
          boxShadow: "var(--mg-shadow-up)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Report a problem</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}>
            ×
          </button>
        </div>
        <ReportForm />
      </div>
    </div>
  );
}
