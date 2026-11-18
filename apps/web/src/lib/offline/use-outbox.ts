'use client';

import { useCallback, useEffect, useState } from 'react';
import { enqueueEntry } from './outbox-db';
import { flushOutbox, isOnline, subscribeOutbox } from './outbox';

/**
 * Client-side helpers for the offline outbox (Task 5).
 *
 * `useOfflineWrite` — call this instead of `api.post/patch/delete` for a
 * write that must survive being offline. Online, it performs the real call
 * immediately (so UX is unchanged). Offline, it persists the op to the
 * IndexedDB outbox; the flush controller delivers it when the network
 * returns and reports a "queued" toast.
 *
 * `useOutboxCount` — a small badge-friendly subscription to the pending
 * operation count, so a UI can show "N operations waiting to sync".
 */

export interface OfflineWriteSpec {
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** Stable id for the logical op. If omitted, a fresh id is generated
   *  (re-queueing the same logical op should pass the same id so it
   *  collapses to one entry). */
  id?: string;
}

function genId(): string {
  // crypto.randomUUID is available in every modern browser and in the
  // service-worker / window contexts we run in.
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useOfflineWrite() {
  const [queued, setQueued] = useState(0);

  const write = useCallback(
    async (spec: OfflineWriteSpec): Promise<{ queued: boolean; ok: boolean }> => {
      // Online: do it for real, return the same shape callers expect.
      // The actual api method is selected by verb below.
      const { method, path, body } = spec;
      const id = spec.id ?? genId();

      if (isOnline()) {
        const { api } = await import('@/lib/api/client');
        if (method === 'POST') await api.post(path, body);
        else if (method === 'PATCH') await api.patch(path, body);
        else await api.delete(path);
        return { queued: false, ok: true };
      }

      // Offline: persist for later delivery.
      await enqueueEntry({
        id,
        method,
        path,
        body,
        createdAt: Date.now(),
        attempts: 0,
        nextRetryAt: null,
      });
      setQueued((c) => c + 1);
      return { queued: true, ok: false };
    },
    [],
  );

  return { write, queued };
}

/**
 * Subscribe to the live pending-outbox count. Returns the number of
 * operations currently waiting to be delivered (0 when in sync).
 */
export function useOutboxCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const unsub = subscribeOutbox((c) => setCount(c));
    return unsub;
  }, []);
  return count;
}

/** Trigger a flush now (e.g. from a "retry" button). */
export function flushNow() {
  return flushOutbox();
}
