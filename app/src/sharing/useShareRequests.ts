import { useCallback, useEffect, useMemo, useState } from "react";
import type { Host } from "../platform";
import type { Vault } from "../vault";
import { isLive, type ShareRecord } from "./records";
import type { Opening } from "./times";

/** A request waiting for the patient: the newest a provider app made for one share, and the older ones it answers too. */
export interface ShareRequest {
  id: string;
  name: string;
  asked: number;
  /** The opening key of the newest ask: an Allow is for this one. */
  key: string;
  keys: string[];
}

/**
 * While almanac is open (docs/DESIGN.md §9): the provider apps' requests waiting for an answer, and a
 * way to answer them — and, as almanac opens, a change to the sharing statement that has not gone yet.
 * The listening and answering load only when there are shares: most days there are none.
 */
export function useShareRequests(vault: Vault, host: Host, shares: ShareRecord[]) {
  const [waiting, setWaiting] = useState<ShareRequest[]>([]);
  const live = useMemo(() => shares.filter((r) => isLive(r, Date.now())), [shares]);
  // Listening starts again when a share starts, stops or has a request answered — not on every reload.
  const listening = live.map((r) => `${r.id}/${r.answered?.length ?? 0}`).join(" ");

  useEffect(() => {
    setWaiting([]);
    if (!host.statements || !live.length) return;
    let stop: (() => void) | null = null;
    let gone = false;
    void import("./answering").then(({ listenForRequests }) => {
      if (!gone) stop = listenForRequests(host, live, setWaiting);
    });
    return () => {
      gone = true;
      stop?.();
    };
    // `live` is read as it is when `listening` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, listening]);

  const hasShares = shares.length > 0;
  useEffect(() => {
    if (!hasShares || !host.statements) return;
    void import("./answering").then(({ sendIfDue }) => sendIfDue(host, vault)).catch(() => {
      // Still due: tried again the next time almanac opens.
    });
  }, [host, vault, hasShares]);

  const answer = useCallback(
    async (request: ShareRequest, opening: Opening | null): Promise<number | null> => {
      setWaiting((w) => w.filter((r) => r.id !== request.id));
      const { answer } = await import("./answering");
      return answer(host, vault, request, opening);
    },
    [host, vault],
  );

  return { waiting, answer };
}
