import { AsyncLocalStorage } from 'async_hooks';
import { createHash } from 'crypto';
import type { Request } from 'express';

/**
 * Per-request context propagated via AsyncLocalStorage so that deep service
 * methods (e.g. events.logRaw) can access hashed client metadata without
 * threading it through every call signature.
 */
export interface RequestContext {
  /** SHA-256 hex of the client IP (privacy-preserving, spec ipHash). */
  ipHash?: string;
  /** SHA-256 hex of the User-Agent header (privacy-preserving, spec userAgentHash). */
  userAgentHash?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** SHA-256 hex of a string. */
function sha256(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

/**
 * Build the request context from an Express request: hashes IP and User-Agent
 * for privacy (never stored in plaintext).
 */
export function buildRequestContext(req: Request): RequestContext {
  return {
    ipHash: req.ip ? sha256(req.ip) : undefined,
    userAgentHash: req.headers['user-agent']
      ? sha256(req.headers['user-agent'])
      : undefined,
  };
}

/**
 * Run a callback within a request-context boundary.
 * Used by the global middleware to wrap every incoming request.
 */
export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContextStorage.run(ctx, fn);
}
