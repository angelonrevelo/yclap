import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import { startReportRetry } from "./report-sheet";
import "./index.css";

/* `/mod` is the moderator console, not the game: its own small chunk, loaded
   only on that path, so no player downloads it. */
const ModConsole = lazy(() => import("./mod-console"));
const is_mod = typeof location !== "undefined" && /^\/mod\/?$/.test(location.pathname);

/* Reports filed offline are sent once the phone is back (report.ts). */
if (!is_mod) startReportRetry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {is_mod ? (
      <Suspense fallback={null}>
        <ModConsole />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
