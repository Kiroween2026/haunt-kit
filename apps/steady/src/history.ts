// Owner: Anish (built by Yadnesh while Anish is unavailable).
// Sessions are saved on this device only, in IndexedDB. No account, no server.
import { summarySchema, type SessionSummary } from "./summary";

const DB_NAME = "steady";
const STORE = "sessions";
const VERSION = 1;

export interface HistoryStore {
  save(summary: SessionSummary): Promise<void>;
  /** Newest first. Records that don't pass the schema are skipped, never thrown on. */
  list(): Promise<SessionSummary[]>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });

export function openHistory(factory: IDBFactory = indexedDB, name = DB_NAME): HistoryStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () =>
    (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(name, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE))
          req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Can't open the history"));
    }));

  return {
    async save(summary) {
      const parsed = summarySchema.parse(summary); // never store something we couldn't read back
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(parsed);
      await done(tx);
    },
    async list() {
      const tx = (await db()).transaction(STORE, "readonly");
      const all = await wrap(tx.objectStore(STORE).getAll());
      const ok: SessionSummary[] = [];
      for (const raw of all) {
        const r = summarySchema.safeParse(raw);
        if (r.success) ok.push(r.data);
      }
      return ok.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || b.id.localeCompare(a.id));
    },
    async remove(id) {
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      await done(tx);
    },
    async clear() {
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      await done(tx);
    },
  };
}

/** An in-memory store, for when IndexedDB isn't available (some private modes) and for tests. */
export function memoryHistory(): HistoryStore {
  const map = new Map<string, SessionSummary>();
  return {
    async save(s) {
      map.set(s.id, summarySchema.parse(s));
    },
    async list() {
      return [...map.values()].sort(
        (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || b.id.localeCompare(a.id),
      );
    },
    async remove(id) {
      map.delete(id);
    },
    async clear() {
      map.clear();
    },
  };
}
