import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import { startReportRetry } from "./report-sheet";
import "./index.css";

/* `/mod` is the moderator console, not the game: its own small chunk, loaded
   only on that path, so no player downloads it. */
const ModConsole = lazy(() => import("./mod-console"));
const is_mod = typeof location !== "undefined" && /^\/mod\/?$/.test(location.pathname);
/* `/seeds` — the organiser console for SEEDS challenges (`seeds-console.tsx`), same arrangement. */
const SeedsConsole = lazy(() => import("./seeds-console"));
const is_seeds = typeof location !== "undefined" && /^\/seeds\/?$/.test(location.pathname);

/* Reports filed offline are sent once the phone is back (report.ts). */
if (!is_mod && !is_seeds) startReportRetry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {is_mod ? (
      <Suspense fallback={null}>
        <ModConsole />
      </Suspense>
    ) : is_seeds ? (
      <Suspense fallback={null}>
        <SeedsConsole />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
