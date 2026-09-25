import type { ReactNode } from "react";
import type { Weather } from "./weather";

/**
 * One card for every interruption the game is allowed to make.
 *
 * Light for "before you start" (safety, you are off campus), dark for "stop,
 * something outside is wrong" (weather, speed). The dark card sits on a dimmed
 * map rather than replacing it, so you can see what you are being stopped
 * from — the same grammar the genre uses, and the reason it reads as a
 * warning rather than as a page.
 *
 * Every card has exactly one button, and it says what you are agreeing to
 * ("I am safe", "I'm a passenger"), not "OK" where a real answer exists.
 */

export interface AlertSpec {
  alert_id: string;
  tone: "light" | "dark";
  mark: "warn" | "safety" | "speed" | { sticker: string };
  title: string;
  body: string;
  /** Small print under the body — the source, or what a pinned reading is. */
  caption?: string;
  action: string;
}

export function AlertCard({ spec, onDismiss }: { spec: AlertSpec; onDismiss: () => void }) {
  return (
    <div className={`al-scrim al-scrim-${spec.tone}`}>
      <div
        className={`al-card al-${spec.tone}`}
        role="alertdialog"
        aria-labelledby={`al-${spec.alert_id}-title`}
        aria-describedby={`al-${spec.alert_id}-body`}
      >
        {spec.tone === "dark" && (
          <span className="al-corner" aria-hidden>
            !
          </span>
        )}
        {spec.mark === "warn" ? (
          <WarnMark />
        ) : spec.mark === "safety" ? (
          <SafetyMark />
        ) : spec.mark === "speed" ? (
          <SpeedMark />
        ) : (
          <img className="al-sticker" src={spec.mark.sticker} alt="" aria-hidden />
        )}
        <h2 id={`al-${spec.alert_id}-title`} className="al-title">
          {spec.title}
        </h2>
        <p id={`al-${spec.alert_id}-body`} className="al-body">
          {spec.body}
        </p>
        {spec.caption && <p className="al-caption">{spec.caption}</p>}
        <button type="button" className="al-button" onClick={onDismiss}>
          {spec.action}
        </button>
      </div>
    </div>
  );
}

/** The road-sign triangle, drawn in the brand ink with the posters' soft yellow. */
function SignTriangle({ children, size = 168 }: { children: ReactNode; size?: number }) {
  return (
    <svg className="al-mark" width={size} height={size * 0.9} viewBox="0 0 200 180" aria-hidden>
      <path d="M100 6 L196 172 L4 172 Z" fill="#FFF7C4" stroke="#FFF7C4" strokeWidth="14" strokeLinejoin="round" />
      <path d="M100 20 L184 164 L16 164 Z" fill="#FFF09A" stroke="#0E3B2A" strokeWidth="8" strokeLinejoin="round" />
      {children}
    </svg>
  );
}

/** A walker with a backpack, head down over a phone — the thing we are warning about. */
export function SafetyMark() {
  return (
    <SignTriangle>
      <g fill="#0E3B2A" stroke="#0E3B2A" strokeLinecap="round" strokeLinejoin="round">
        <line x1="70" y1="150" x2="132" y2="150" strokeWidth="3" />
        <path d="M95 104 L88 126 L80 146" fill="none" strokeWidth="9" />
        <path d="M97 104 L108 124 L120 144" fill="none" strokeWidth="9" />
        <path d="M76 146 L88 147" fill="none" strokeWidth="6" />
        <path d="M117 145 L128 142" fill="none" strokeWidth="6" />
        <path d="M92 78 Q90 92 95 106" fill="none" strokeWidth="15" />
        <rect x="78" y="78" width="12" height="22" rx="5" stroke="none" />
        <path d="M96 84 L104 97 L113 92" fill="none" strokeWidth="5" />
        <rect x="111" y="84" width="7" height="11" rx="1.6" transform="rotate(-18 114 90)" stroke="none" />
        <circle cx="99" cy="66" r="8.5" stroke="none" />
        <path d="M90 62 Q98 52 107 60 L114 62" fill="none" strokeWidth="4" />
      </g>
    </SignTriangle>
  );
}

export function WarnMark() {
  return (
    <svg className="al-mark" width={120} height={106} viewBox="0 0 200 180" aria-hidden>
      <path d="M100 18 L186 166 L14 166 Z" fill="#F5C842" stroke="#0E3B2A" strokeWidth="9" strokeLinejoin="round" />
      <rect x="91" y="64" width="18" height="58" rx="9" fill="#0E3B2A" />
      <circle cx="100" cy="142" r="10" fill="#0E3B2A" />
    </svg>
  );
}

/** A car in the sign: "you are moving faster than a walk". */
function SpeedMark() {
  return (
    <SignTriangle size={136}>
      <g fill="#0E3B2A">
        <path d="M62 132 L68 110 Q71 102 80 102 L120 102 Q129 102 132 110 L138 132 Q142 134 142 140 L142 146 L58 146 L58 140 Q58 134 62 132 Z" />
        <path d="M76 128 L80 112 L120 112 L124 128 Z" fill="#FFF09A" />
        <circle cx="76" cy="148" r="8" />
        <circle cx="124" cy="148" r="8" />
      </g>
    </SignTriangle>
  );
}

/* ── weather, in the HUD ───────────────────────────────────────────────── */

function SkyGlyph({ weather }: { weather: Weather }) {
  const stroke = "#0E3B2A";
  if (weather.sky === "storm" || weather.sky === "rain") {
    return (
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <path d="M9 20 Q3 20 4 14.5 Q5 10 10 10.5 Q12 5 18 6 Q24 7 24.5 12 Q29 12.5 28.5 16.5 Q28 20 24 20 Z" fill="#DDEFFB" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
        {weather.sky === "storm" ? (
          <path d="M17 20 L13.5 26 L17 26 L14.5 31" fill="none" stroke="#F59A23" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <g stroke="#2F80D8" strokeWidth="2.2" strokeLinecap="round">
            <line x1="11" y1="23.5" x2="9.5" y2="27.5" />
            <line x1="17" y1="23.5" x2="15.5" y2="27.5" />
            <line x1="23" y1="23.5" x2="21.5" y2="27.5" />
          </g>
        )}
      </svg>
    );
  }
  if (!weather.is_day) {
    return (
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <path d="M21 5 Q11 6 10.5 16 Q11 26 21.5 27 Q14 30 8 25 Q3 20 4.5 13 Q7 5 16 4 Q18.5 4 21 5 Z" fill="#FFF6DC" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M24 9 l1 2 2 1 -2 1 -1 2 -1 -2 -2 -1 2 -1 Z" fill="#F5C842" />
      </svg>
    );
  }
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <g stroke="#F59A23" strokeWidth="2.2" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={16 + Math.cos(a) * 10} y1={16 + Math.sin(a) * 10} x2={16 + Math.cos(a) * 13.5} y2={16 + Math.sin(a) * 13.5} />;
        })}
      </g>
      <circle cx="16" cy="16" r="6.8" fill="#F5C842" stroke={stroke} strokeWidth="1.8" />
      {weather.sky === "cloud" && (
        <path d="M13 27 Q8.5 27 9 23 Q9.5 20 13 20.5 Q14.5 17.5 18.5 18 Q22 18.6 22 21.5 Q25 21.7 25 24.3 Q25 27 22 27 Z" fill="#fff" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** The top-right weather button: the sky right now, and a badge when it is a reason to stop. */
export function WeatherChip({ weather, onOpen }: { weather: Weather; onOpen: () => void }) {
  const label = weather.warn
    ? `Weather warning: ${weather.warn}. ${Math.round(weather.temp_c)} degrees.`
    : `Weather: ${Math.round(weather.temp_c)} degrees, ${weather.sky}.`;
  return (
    <button type="button" className="gm-map-btn al-weather-chip" onClick={onOpen} aria-label={label} title={label}>
      <SkyGlyph weather={weather} />
      <span className="al-weather-temp">{Math.round(weather.temp_c)}°</span>
      {weather.warn && (
        <span className="al-weather-badge" aria-hidden>
          <svg width="18" height="16" viewBox="0 0 200 180">
            <path d="M100 18 L186 166 L14 166 Z" fill="#F5C842" stroke="#0E3B2A" strokeWidth="14" strokeLinejoin="round" />
            <rect x="89" y="62" width="22" height="60" rx="10" fill="#0E3B2A" />
            <circle cx="100" cy="143" r="12" fill="#0E3B2A" />
          </svg>
        </span>
      )}
    </button>
  );
}
