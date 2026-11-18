import { api, ApiError } from '@/lib/api/client';
import { toast } from 'sonner';
import {
  listPending,
  removeEntry,
  markFailed,
  pendingCount,
  type OutboxEntry,
} from './outbox-db';

/**
 * Outbox flush controller (Task 5).
 *
 * A single module-level singleton wires `online` / `visibilitychange` /
 * `pagehide` events to a debounced `flushOutbox()` loop. Each entry is
 * replayed against the real API with its original method/path/body; success
 * removes it, failure bumps its backoff. The loop is re-entrant safe
 * (a second flush started while one is running simply waits its turn).
 *
 * Subscribers get notified after each flush with the new pending count so
 * UI (e.g. a "N operations waiting" badge) can update reactively.
 */

type Listener = (count: number) => void;

const listeners = new Set<Listener>();
let flushInFlight = false;
let listenersWired = false;
let onlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;

function notify() {
  void pendingCount().then((count) => {
    listeners.forEach((l) => l(count));
  });
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  // Emit current count immediately so the subscriber is in sync.
  void pendingCount().then((count) => listener(count));
  return () => listeners.delete(listener);
}

/**
 * Replay every due outbox entry against the API. Returns the number of
 * entries successfully delivered. Safe to call repeatedly; concurrent calls
 * collapse into a single run.
 */
export async function flushOutbox(): Promise<number> {
  if (flushInFlight) return 0;
  if (typeof window === 'undefined') return 0;
  if (!navigator.onLine) return 0;

  flushInFlight = true;
  let delivered = 0;
  try {
    const due = await listPending();
    for (const entry of due) {
      try {
        // Replay with the original verb + body. The client re-reads the
        // token from localStorage, so a session that expired/refreshed while
        // offline is still honored.
        if (entry.method === 'POST') await api.post(entry.path, entry.body);
        else if (entry.method === 'PATCH') await api.patch(entry.path, entry.body);
        else await api.delete(entry.path);
        await removeEntry(entry.id);
        delivered += 1;
      } catch (err) {
        // 4xx (except 401/408/429) is an app-level rejection — do NOT retry
        // those forever; surface and drop. Network / 5xx / 408 / 429 retry.
        const status = err instanceof ApiError ? err.status : 0;
        const isRetryable =
          status === 0 || status === 408 || status === 429 || status >= 500;
        const msg = err instanceof Error ? err.message : String(err);
        if (isRetryable) {
          await markFailed(entry.id, entry.attempts + 1, msg);
        } else {
          // Non-retryable: drop and tell the user what failed.
          await removeEntry(entry.id);
          toast.error(`عملیات آفلاین انجام نشد: ${entry.path}`);
        }
      }
    }
    notify();
    return delivered;
  } finally {
    flushInFlight = false;
  }
}

function wireEvents() {
  if (listenersWired || typeof window === 'undefined') return;
  listenersWired = true;

  window.addEventListener('online', () => {
    onlineState = true;
    void flushOutbox();
  });
  window.addEventListener('offline', () => {
    onlineState = false;
    notify();
  });
  // Flush when the tab regains focus (covers the browser re-enabling network
  // without a clean `online` event on some platforms).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      void flushOutbox();
    }
  });
  // Best-effort flush before the page goes away.
  window.addEventListener('pagehide', () => {
    void flushOutbox();
  });
}

/** Call once at app boot (PwaRegister) to start listening. */
export function startOutbox(): void {
  wireEvents();
  // If we start up already-online with pending work, drain it immediately.
  if (onlineState) void flushOutbox();
}

export function isOnline(): boolean {
  return onlineState;
}
