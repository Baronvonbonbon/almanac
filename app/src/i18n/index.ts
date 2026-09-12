import { en } from "./en";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof en>;

/** The English message for `key`, with `{name}` placeholders filled from `vars`. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const message = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en);
  if (typeof message !== "string") throw new Error(`no message for "${key}"`);
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in vars ? String(vars[name]) : placeholder));
}

/** Every message, flattened — for checks over all of them. */
export function allMessages(node: unknown = en, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else for (const value of Object.values(node as Record<string, unknown>)) allMessages(value, out);
  return out;
}
