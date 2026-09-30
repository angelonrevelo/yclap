/**
 * Settings → Walker → Account. Sign up, log in, log out, change password,
 * Continue with Google — and, as plainly as the buttons, what an account
 * stores and what it does not.
 *
 * `AccountChip` is the small line on the HUD player card that says who is
 * signed in; it renders nothing when nobody is.
 */
import { useState, type CSSProperties, type FormEvent } from "react";
import {
  GOOGLE_HREF,
  changePassword,
  logIn,
  logOut,
  refreshAccount,
  signUp,
  syncSave,
  UPDATE_AVAILABLE,
  useAccount,
  takeNameNotice,
} from "./account.ts";
import { PASSWORD_MIN } from "./account-core.ts";

const EDGE = "rgb(var(--mg-ink-rgb) / 0.09)";
const DIM = "rgb(var(--mg-ink-rgb) / 0.62)";
const FAINT = "rgb(var(--mg-ink-rgb) / 0.5)";

const CARD: CSSProperties = {
  background: "var(--mg-surface)",
  border: `1px solid ${EDGE}`,
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 10,
};

const INPUT: CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "8px 10px",
  borderRadius: 9,
  border: `1.5px solid ${EDGE}`,
  background: "#fff",
  color: "var(--mg-text-boldest)",
  fontSize: 13.5,
  fontWeight: 700,
  /* 44 px: the smallest hit area a thumb reliably lands on. */
  minHeight: 44,
  boxSizing: "border-box",
};

const BTN: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 9,
  border: "none",
  background: "var(--mg-green)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 12.5,
  cursor: "pointer",
  minHeight: 44,
};

const GHOST: CSSProperties = {
  ...BTN,
  background: "transparent",
  color: "var(--mg-green-text)",
  border: "1.5px solid var(--mg-green)",
};

const HEAD: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: FAINT,
};

const NOTE: CSSProperties = { fontSize: 11.5, color: DIM, lineHeight: 1.45, margin: 0 };

const CALLBACK_ERROR: Record<string, string> = {
  google_off: "Google sign-in is not switched on for this server.",
  state: "The Google sign-in expired or came from another tab. Try again.",
  denied: "Google sign-in was cancelled.",
  no_code: "Google did not send a sign-in code back. Try again.",
  google_token: "Google's answer could not be verified. Try again.",
  google_taken: "That Google account is already linked to a different Magisphere account.",
};

function callbackError(): string | null {
  if (typeof location === "undefined") return null;
  const code = new URLSearchParams(location.search).get("account_error");
  return code ? (CALLBACK_ERROR[code] ?? "Google sign-in failed.") : null;
}

function Google({ is_google, label }: { is_google: boolean; label: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {is_google ? (
        <a href={GOOGLE_HREF} style={{ ...GHOST, textAlign: "center", textDecoration: "none", display: "block" }}>
          {label}
        </a>
      ) : (
        <button type="button" disabled style={{ ...GHOST, opacity: 0.45, cursor: "not-allowed" }}>
          {label}
        </button>
      )}
      {!is_google && (
        <p style={NOTE}>
          Google sign-in is not switched on for this server yet — it needs OAuth keys the team has not added. Use a
          username and password for now.
        </p>
      )}
    </div>
  );
}

function SignedOut({ is_google }: { is_google: boolean }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [display_name, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(callbackError);
  const [is_busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const problem =
      mode === "signup" ? await signUp(username, password, display_name) : await logIn(username, password);
    setBusy(false);
    if (problem) setError(problem);
    else setPassword("");
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={CARD} aria-label={mode === "login" ? "Log in" : "Sign up"}>
      <div style={{ display: "flex", gap: 6 }}>
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            aria-pressed={mode === m}
            style={{ ...(mode === m ? BTN : GHOST), flex: 1 }}
          >
            {m === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value.slice(0, 32))}
        placeholder="username"
        aria-label="Username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        style={INPUT}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === "signup" ? `password (${PASSWORD_MIN}+ characters)` : "password"}
        aria-label="Password"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        required
        style={INPUT}
      />
      {mode === "signup" && (
        <input
          value={display_name}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
          placeholder="display name (optional)"
          aria-label="Display name"
          style={INPUT}
        />
      )}
      {error && (
        <p role="alert" style={{ ...NOTE, color: "#B3261E", fontWeight: 700 }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={is_busy} style={{ ...BTN, opacity: is_busy ? 0.6 : 1 }}>
        {is_busy ? "…" : mode === "login" ? "Log in" : "Create account"}
      </button>
      <Google is_google={is_google} label="Continue with Google" />
    </form>
  );
}

function SignedIn() {
  const account = useAccount();
  const [old_password, setOld] = useState("");
  const [new_password, setNew] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [is_busy, setBusy] = useState(false);
  /* The name filter's answer to the display name asked for at signup, once. */
  const [name_notice] = useState(takeNameNotice);
  const me = account.account!;

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const problem = await changePassword(old_password, new_password);
    setBusy(false);
    setNote(problem ?? "Password changed. Other devices are signed out.");
    if (!problem) {
      setOld("");
      setNew("");
    }
  }

  const sync = account.last_sync;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={CARD}>
        <div style={HEAD}>Signed in</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: "var(--mg-forest)" }}>{me.display_name}</div>
        {name_notice && (
          <p role="status" style={{ ...NOTE, color: "#8A5A00", fontWeight: 700 }}>
            {name_notice}
          </p>
        )}
        <div style={NOTE}>
          @{me.username}
          {me.is_google ? " · Google linked" : ""}
        </div>
        <div style={NOTE}>
          {account.is_syncing
            ? "Syncing your journal…"
            : sync
              ? `Synced ${new Date(sync.at).toLocaleTimeString()} — ${sync.sighting_count} journal entr${sync.sighting_count === 1 ? "y" : "ies"} on the account` +
                (sync.added_sighting_count ? `, ${sync.added_sighting_count} pulled onto this phone` : "") +
                "."
              : "Not synced yet."}
        </div>
        {account.error && <p style={{ ...NOTE, color: "#B3261E", fontWeight: 700 }}>{account.error}</p>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {account.error === UPDATE_AVAILABLE ? (
            <button type="button" style={BTN} onClick={() => location.reload()}>
              Reload
            </button>
          ) : (
            <button type="button" style={BTN} disabled={account.is_syncing} onClick={() => void syncSave()}>
              {account.error ? "Retry" : "Sync now"}
            </button>
          )}
          <button type="button" style={GHOST} onClick={() => void logOut()}>
            Log out
          </button>
        </div>
        {!me.is_google && <Google is_google={account.is_google} label="Link Google to this account" />}
      </div>

      <form onSubmit={(e) => void submitPassword(e)} style={CARD} aria-label="Change password">
        <div style={HEAD}>{me.has_password ? "Change password" : "Set a password"}</div>
        {me.has_password && (
          <input
            type="password"
            value={old_password}
            onChange={(e) => setOld(e.target.value)}
            placeholder="current password"
            aria-label="Current password"
            autoComplete="current-password"
            required
            style={INPUT}
          />
        )}
        <input
          type="password"
          value={new_password}
          onChange={(e) => setNew(e.target.value)}
          placeholder={`new password (${PASSWORD_MIN}+ characters)`}
          aria-label="New password"
          autoComplete="new-password"
          required
          style={INPUT}
        />
        {note && <p style={NOTE}>{note}</p>}
        <button type="submit" disabled={is_busy} style={{ ...BTN, opacity: is_busy ? 0.6 : 1 }}>
          {me.has_password ? "Change password" : "Set password"}
        </button>
      </form>
    </div>
  );
}

export default function AccountPanel() {
  const account = useAccount();
  return (
    <section aria-label="Account" style={{ display: "grid", gap: 10 }}>
      {account.status === "loading" && <p style={NOTE}>Checking for an account…</p>}
      {account.status === "offline" && (
        <div style={CARD}>
          <p style={NOTE}>{account.error}</p>
          <button type="button" style={GHOST} onClick={() => void refreshAccount()}>
            Try again
          </button>
        </div>
      )}
      {account.status === "signed_out" && <SignedOut is_google={account.is_google} />}
      {account.status === "signed_in" && account.account && <SignedIn />}
      <div style={{ ...CARD, gap: 6 }}>
        <div style={HEAD}>What an account keeps</div>
        <p style={NOTE}>
          Optional. Signing in copies your journal entries (species, place, time, notes) and your points and streak to
          the Magisphere server, so they come back on a new phone. <b>Photos stay on this phone</b> — they are never
          uploaded.
        </p>
        <p style={NOTE}>
          Signing in on a phone merges both sides: nothing found on this phone is dropped. Something you deleted here
          can come back from the account copy.
        </p>
        <p style={NOTE}>
          This is the student project's own server, not an Ateneo system — it is not an Ateneo login, and your
          password is stored only as a salted PBKDF2 hash.
        </p>
      </div>
    </section>
  );
}

/** One line on the player card: who is signed in. Nothing when nobody is. */
export function AccountChip() {
  const account = useAccount();
  if (account.status !== "signed_in" || !account.account) return null;
  return (
    <span
      className="gm-account-chip"
      title={`Signed in as @${account.account.username}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        maxWidth: 110,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: 10,
        fontWeight: 800,
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--mg-green)" }} />@
      {account.account.username}
    </span>
  );
}
