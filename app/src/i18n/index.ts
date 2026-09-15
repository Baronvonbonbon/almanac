import { en } from "./en";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof en>;

/**
 * A `t` for one table of messages, and every message in it — almanac's own, and the provider app's,
 * which has a table of its own beside almanac's (its shared components still read almanac's).
 */
export function messages<T extends object>(table: T) {
  /** The English message for `key`, with `{name}` placeholders filled from `vars`. */
  function t(key: Leaves<T>, vars: Record<string, string | number> = {}): string {
    const message = (key as string).split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], table);
    if (typeof message !== "string") throw new Error(`no message for "${key}"`);
    return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in vars ? String(vars[name]) : placeholder));
  }
  function flatten(node: unknown, out: string[]): string[] {
    if (typeof node === "string") out.push(node);
    else for (const value of Object.values(node as Record<string, unknown>)) flatten(value, out);
    return out;
  }
  /** Every message, flattened — for checks over all of them. */
  const allMessages = (): string[] => flatten(table, []);
  return { t, allMessages };
}

export const { t, allMessages } = messages(en);
