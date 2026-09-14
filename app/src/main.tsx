import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startLook } from "./look";
import { detectHost } from "./platform";
import "./style.css";

const host = detectHost();
// The look first, so the first screen already appears in it. A host that fails to start is reported
// by App; the look just falls back to the default.
await startLook(await host.catch(() => null)).catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App host={host} />
  </StrictMode>,
);
