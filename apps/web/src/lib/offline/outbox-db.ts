import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * IndexedDB-backed outbox for offline write buffering (Task 5).
 *
 * When the browser is offline, write calls that the client cannot deliver
 * straight to the API are persisted here instead of being dropped. When the
 * network returns, the outbox flushes entries back to the API with backoff.
 *
 * The DB is deliberately tiny: one store of pending operations, keyed by a
 * client-generated id (so re-queueing the same logical op is idempotent).
 */

export interface OutboxEntry {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  /** Path relative to /api/v1, e.g. `/sessions/<id>/drafts`. */
  path: string;
  /** JSON-serializable body (undefined for bodyless ops). */
  body?: unknown;
  /** Client clock at enqueue time (epoch ms). */
  createdAt: number;
  /** How many flush attempts have failed (drives backoff). */
  attempts: number;
  /** Epoch ms at which the next retry is allowed; null = eligible now. */
  nextRetryAt: number | null;
  /** Last failure message, for UI/debugging. */
  lastError?: string;
}

interface OutboxDB extends DBSchema {
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { 'by-retry': number };
  };
}

const DB_NAME = 'kargah-offline';
const DB_VERSION = 1;
const STORE = 'outbox';

let dbPromise: Promise<IDBPDatabase<OutboxDB>> | null = null;

function getDB(): Promise<IDBPDatabase<OutboxDB>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('outbox requires a browser environment'));
  }
  if (!dbPromise) {
    dbPromise = openDB<OutboxDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by-retry', 'nextRetryAt');
      },
    });
  }
  return dbPromise;
}

export async function enqueueEntry(entry: OutboxEntry): Promise<void> {
  const db = await getDB();
  // put() is idempotent on the key — re-queueing the same logical op overwrites.
  await db.put(STORE, entry);
}

export async function listPending(now: number = Date.now()): Promise<OutboxEntry[]> {
  const db = await getDB();
  const all = await db.getAll(STORE);
  // Only entries whose nextRetryAt has come due are eligible for a flush.
  return all
    .filter((e) => e.nextRetryAt == null || e.nextRetryAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function allEntries(): Promise<OutboxEntry[]> {
  const db = await getDB();
  return db.getAll(STORE);
}

export async function removeEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}

export async function markFailed(
  id: string,
  attempts: number,
  lastError: string,
): Promise<void> {
  const db = await getDB();
  const entry = await db.get(STORE, id);
  if (!entry) return;
  entry.attempts = attempts;
  entry.lastError = lastError;
  // Exponential backoff: base 10s * 2^(attempts-1), capped at 15 min.
  const backoffMs = Math.min(10_000 * 2 ** (attempts - 1), 15 * 60_000);
  entry.nextRetryAt = Date.now() + backoffMs;
  await db.put(STORE, entry);
}

/** Count for UI badge; does not apply the retry gate. */
export async function pendingCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE);
}

/** Test/maintenance only — clear the whole outbox. */
export async function clearOutbox(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE);
}
