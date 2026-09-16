import "./style.css";
import { isInsideContainerSync } from "@parity/product-sdk";
import { PROBE_DOT_NAME } from "../product.mjs";
import { CHECKS } from "./checks";
import { Journal } from "./journal";
import type { Check, Outcome, Status } from "./types";
import { day, errText } from "./util";

const inApp = isInsideContainerSync();

const LABEL: Record<Status, string> = { pass: "✓ Good", fail: "✗ Problem", info: "● Measured", skip: "– Skipped" };

type Child = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c): c is Node | string => !!c));
  return node;
}

function button(text: string, onClick: () => void | Promise<void>, className = ""): HTMLButtonElement {
  const b = el("button", { type: "button", textContent: text, className });
  b.addEventListener("click", () => void onClick());
  return b;
}

/** Reports can hold bigints (statement expiries); JSON.stringify throws on them. */
const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

function showOutcome(target: HTMLElement, o: Outcome & { at: number }, earlier: boolean) {
  const parts: Child[] = [
    el("p", { className: `status ${o.status}` }, el("strong", {}, LABEL[o.status]), ` ${o.summary}`),
    earlier && el("p", { className: "when" }, `Last run ${day(o.at)} UTC`),
    o.data && el("details", {}, el("summary", {}, "Details"), el("pre", {}, json(o.data))),
  ];
  target.replaceChildren(...parts.filter((c): c is Node | string => !!c));
}

function card(check: Check, journal: Journal): HTMLElement {
  const blocked = !!check.needsHost && !inApp;
  const result = el("div", { className: "result" });
  const log = el("pre", { className: "log", hidden: true });
  const recorded = el("p", { className: "recorded" });
  const input = check.input
    ? el("input", { type: "text", placeholder: check.input.placeholder, ariaLabel: check.input.label })
    : null;

  const last = journal.entries(check.id).at(-1);
  if (last) showOutcome(result, last, true);
  const lastConfirm = journal.entries(`${check.id}:confirm`).at(-1);
  if (lastConfirm) recorded.textContent = `Recorded ${day(lastConfirm.at)} UTC: ${lastConfirm.summary}`;

  let run: HTMLButtonElement | null = null;
  if (check.run) {
    run = button(blocked ? "Needs the Polkadot app" : "Run", async () => {
      run!.disabled = true;
      run!.textContent = "Running…";
      log.textContent = "";
      log.hidden = true;
      let outcome: Outcome;
      try {
        outcome = await check.run!({
          journal,
          input: input?.value ?? "",
          log: (line) => {
            log.hidden = false;
            log.textContent += `${line}\n`;
          },
        });
      } catch (e) {
        outcome = { status: "fail", summary: `Stopped with an error: ${errText(e)}` };
      }
      await journal.record({ id: check.id, ...outcome });
      showOutcome(result, { ...outcome, at: Date.now() }, false);
      run!.disabled = false;
      run!.textContent = "Run again";
    });
    run.disabled = blocked;
  }

  const confirm =
    check.confirm &&
    el(
      "div",
      { className: "confirm" },
      ...check.confirm.map((label, i) =>
        button(
          label,
          async () => {
            await journal.record({ id: `${check.id}:confirm`, status: i === 0 ? "pass" : "fail", summary: label });
            recorded.textContent = `Recorded: ${label}`;
          },
          "secondary",
        ),
      ),
    );

  return el(
    "section",
    { className: "card" },
    el("div", { className: "head" }, el("span", { className: "id" }, check.id), el("h2", {}, check.title)),
    el("p", { className: "decides" }, check.decides),
    check.steps && el("ol", {}, ...check.steps.map((s) => el("li", {}, s))),
    input && el("label", {}, el("span", { className: "label" }, check.input!.label), input),
    run,
    log,
    result,
    confirm,
    recorded,
  );
}

function reportSection(journal: Journal): HTMLElement {
  const area = el("textarea", { readOnly: true, rows: 10, hidden: true, ariaLabel: "Report" });
  const note = el("p", { className: "recorded" });
  const refresh = () => {
    area.value = json({
      probe: __PROBE_VERSION__,
      build: __BUILD_ID__,
      sdk: __SDK_VERSIONS__,
      product: PROBE_DOT_NAME,
      inApp,
      userAgent: navigator.userAgent,
      exportedAt: new Date().toISOString(),
      journal: journal.toJSON(),
    });
  };
  const showText = () => {
    area.hidden = false;
    area.select();
  };
  return el(
    "section",
    { className: "card report" },
    el("h2", {}, "Report"),
    el(
      "p",
      { className: "decides" },
      "Export before reinstalling the Polkadot app — results kept on this phone may not survive it. That is exactly what P1 checks.",
    ),
    el(
      "div",
      { className: "row" },
      button("Copy report", async () => {
        refresh();
        try {
          await navigator.clipboard.writeText(area.value);
          note.textContent = "Copied.";
        } catch (e) {
          showText();
          note.textContent = `Copy refused (${errText(e)}) — select the text below instead.`;
        }
      }),
      button(
        "Share report",
        async () => {
          refresh();
          try {
            await navigator.share({ title: "almanac probe report", text: area.value });
          } catch (e) {
            note.textContent = `Share refused (${errText(e)}).`;
          }
        },
        "secondary",
      ),
      button(
        "Show report",
        () => {
          refresh();
          showText();
        },
        "secondary",
      ),
    ),
    note,
    area,
  );
}

async function main() {
  const journal = await Journal.open();
  document.getElementById("app")!.append(
    el(
      "header",
      {},
      el("h1", {}, "almanac"),
      el("p", { className: "sub" }, "Device probe · Phase 0"),
      el(
        "p",
        { className: "env" },
        inApp
          ? `Running inside the Polkadot app as ${PROBE_DOT_NAME}.`
          : `Running in a web browser, so only some checks can run. Open ${PROBE_DOT_NAME} in the Polkadot app for the rest.`,
      ),
      el(
        "p",
        { className: "env" },
        `Build ${__BUILD_ID__} · probe ${__PROBE_VERSION__} · ${journal.durable ? "results are kept between runs" : "results are not kept after this page closes"}`,
      ),
      el("p", { className: "note" }, "Use a test account: the exported report includes its addresses."),
    ),
    ...CHECKS.map((c) => card(c, journal)),
    reportSection(journal),
  );
}

main().catch((e) => {
  document.getElementById("app")!.textContent = `The probe could not start: ${errText(e)}`;
});
