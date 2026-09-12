import { isInsideContainerSync } from "@parity/product-sdk";
import { getHostLocalStorage } from "@parity/product-sdk-host";
import type { Status } from "./types";

export interface Entry {
  id: string;
  at: number;
  build: string;
  status: Status;
  summary: string;
  data?: Record<string, unknown>;
}

export interface Upload {
  cid: string;
  bytes: number;
  at: number;
  build: string;
}

export interface Scheduled {
  id: string;
  at: number;
  fireAt: number;
}

interface JournalData {
  version: 1;
  created: number;
  entries: Entry[];
  uploads: Upload[];
  scheduled: Scheduled[];
}

const KEY = "probe/journal/v1";
const MAX_ENTRIES = 400;

/**
 * Everything the probe has seen, kept in host local storage so it spans restarts, app updates and —
 * if P1 says so — reinstalls. Outside the app it lives in memory only.
 *
 * The journal is itself subject to P1: if a reinstall wipes host storage, it goes too. That is why the
 * report export exists, and why the UI says to export before reinstalling.
 */
export class Journal {
  private constructor(
    private data: JournalData,
    readonly durable: boolean,
  ) {}

  static async open(): Promise<Journal> {
    const empty: JournalData = { version: 1, created: Date.now(), entries: [], uploads: [], scheduled: [] };
    if (!isInsideContainerSync()) return new Journal(empty, false);
    const store = await getHostLocalStorage();
    if (!store) return new Journal(empty, false);
    try {
      const saved = (await store.readJSON(KEY)) as JournalData | null | undefined;
      return new Journal(saved?.version === 1 ? saved : empty, true);
    } catch {
      return new Journal(empty, true);
    }
  }

  entries(id?: string): Entry[] {
    return id ? this.data.entries.filter((e) => e.id === id) : this.data.entries;
  }

  uploads(): Upload[] {
    return this.data.uploads;
  }

  scheduled(): Scheduled[] {
    return this.data.scheduled;
  }

  async record(e: Omit<Entry, "at" | "build">): Promise<void> {
    this.data.entries.push({ ...e, at: Date.now(), build: __BUILD_ID__ });
    if (this.data.entries.length > MAX_ENTRIES) this.data.entries.splice(0, this.data.entries.length - MAX_ENTRIES);
    await this.save();
  }

  async addUpload(u: Upload): Promise<void> {
    this.data.uploads.push(u);
    await this.save();
  }

  async addScheduled(s: Scheduled): Promise<void> {
    this.data.scheduled.push(s);
    await this.save();
  }

  toJSON(): JournalData {
    return this.data;
  }

  private async save(): Promise<void> {
    if (!this.durable) return;
    const store = await getHostLocalStorage();
    await store?.writeJSON(KEY, this.data);
  }
}
