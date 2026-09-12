import { isInsideContainerSync } from "@parity/product-sdk";
import { PRODUCT_ID } from "../../product.mjs";
import type { Check } from "../types";
import { errText, since, withTimeout } from "../util";

// Devnet entries from pad 0.16.1's environments.json.
const IPFS_GATEWAY = "https://devnet-ipfs.api.polkadotcommunity.foundation";
const RPCS = [
  "wss://people-paseo.rotko.net",
  "wss://rpc.interweb-it.com/people-paseo",
  "wss://bulletin-paseo.tservices.es:8443",
  "wss://bullet.sik.rocks",
];

export const gateway: Check = {
  id: "P10",
  title: "What can the web version reach on its own?",
  decides:
    "Whether a doctor's timed link can open in a normal browser and still be stopped — or has to become expire-only.",
  steps: [
    "Run it here inside the Polkadot app.",
    `Then open ${PRODUCT_ID}.dev-dot.li in a phone browser and run it there, pasting a CID from P6.`,
  ],
  input: { label: "CID to fetch", placeholder: "bafy… (defaults to the newest P6 upload)" },
  async run({ journal, input, log }) {
    // The host's content policy, if any, reports what it blocks here.
    const violations: string[] = [];
    const onViolation = (e: SecurityPolicyViolationEvent) => violations.push(`${e.effectiveDirective} ${e.blockedURI}`);
    document.addEventListener("securitypolicyviolation", onViolation);

    const rows: Record<string, string> = {};
    try {
      const cid = input.trim() || journal.uploads().at(-1)?.cid;
      if (cid) {
        const t0 = performance.now();
        try {
          const res = await withTimeout(fetch(`${IPFS_GATEWAY}/ipfs/${cid}`), 30_000, "fetch");
          const bytes = (await res.arrayBuffer()).byteLength;
          rows["IPFS gateway"] = `HTTP ${res.status}, ${bytes} bytes in ${since(t0)} ms`;
        } catch (e) {
          rows["IPFS gateway"] = `blocked or failed after ${since(t0)} ms — ${errText(e)}`;
        }
      } else {
        rows["IPFS gateway"] = "skipped — no CID (paste one from P6)";
      }
      log(`IPFS gateway: ${rows["IPFS gateway"]}`);

      const answers = await Promise.all(RPCS.map(rpcMethods));
      RPCS.forEach((url, i) => (rows[url] = answers[i]));
    } finally {
      document.removeEventListener("securitypolicyviolation", onViolation);
    }
    rows["blocked by content policy"] = violations.length ? violations.join("; ") : "nothing reported";

    const statementRpc = RPCS.find((url) => rows[url].includes("statement_"));
    return {
      status: "info",
      summary: `${isInsideContainerSync() ? "In the app" : "In a browser"}: IPFS gateway ${rows["IPFS gateway"].startsWith("HTTP 200") ? "reachable" : "not reachable"}; statement store over RPC ${statementRpc ? `reachable (${statementRpc})` : "not found"}.`,
      data: rows,
    };
  },
};

/** Open a WebSocket, ask for rpc_methods, and report whether any statement_* method is offered. */
function rpcMethods(url: string): Promise<string> {
  return new Promise((resolve) => {
    let ws: WebSocket | undefined;
    const finish = (answer: string) => {
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // already closed
      }
      resolve(answer);
    };
    const timer = setTimeout(() => finish("no answer in 15 s"), 15_000);
    try {
      ws = new WebSocket(url);
    } catch (e) {
      finish(`refused — ${errText(e)}`);
      return;
    }
    ws.onopen = () => ws!.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "rpc_methods", params: [] }));
    ws.onerror = () => finish("connection failed");
    ws.onmessage = (m) => {
      try {
        const methods: string[] = JSON.parse(String(m.data)).result?.methods ?? [];
        const statement = methods.filter((x) => x.startsWith("statement_"));
        finish(`connected; ${methods.length} methods; ${statement.length ? statement.join(", ") : "no statement_* methods"}`);
      } catch {
        finish("connected, but the reply was unreadable");
      }
    };
  });
}
