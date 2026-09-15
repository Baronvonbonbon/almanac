import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { detectHost } from "@app/platform";
import { chooseHost } from "@app/startup";
import { watchHiddenBottom } from "@app/ui/hiddenBottom";
import { App } from "./App";
import { showStartingLook, startLook } from "./look";
import "@app/style.css";

// As almanac starts (app/src/main.tsx): the starting screen at once, the host found and checked — or
// the tryout, which keeps nothing — and the look before the first real screen.
watchHiddenBottom();
showStartingLook();
const host = chooseHost(detectHost());
const lookReady = host
  .catch(() => null)
  .then(startLook)
  .catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App host={host} lookReady={lookReady} />
  </StrictMode>,
);
