import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { showStartingLook, startLook } from "./look";
import { detectHost } from "./platform";
import { chooseHost } from "./startup";
import { watchHiddenBottom } from "./ui/hiddenBottom";
import "./style.css";

watchHiddenBottom();
// The starting screen shows at once, while the host is found and checked (up to HOST_WAIT_MS). The
// saved look follows before the first real screen, so that screen already appears in it. A host
// that fails to start is reported by App; the look just falls back to the default.
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
