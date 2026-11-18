import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { buildRequestContext, runWithRequestContext } from '../context/request-context';

/**
 * Global middleware: wraps every request in an AsyncLocalStorage context so
 * that any service method called during this request can read the hashed
 * IP / User-Agent without explicit parameter threading.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const ctx = buildRequestContext(req);
    runWithRequestContext(ctx, async () => {
      next();
    });
  }
}
