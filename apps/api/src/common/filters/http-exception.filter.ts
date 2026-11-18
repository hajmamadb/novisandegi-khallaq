import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * DECISION: spec D.16 error codes are returned as a stable envelope
 *   { error: { code, message }, statusCode, timestamp, path }
 * so the web client can switch on `error.code` (e.g. AUTH_TOKEN_EXPIRED)
 * without parsing free-text messages.
 */
export interface ErrorResponse {
  error: { code: string; message: string };
  statusCode: number;
  timestamp: string;
  path: string;
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'AUTH_INVALID_CREDENTIALS',
  403: 'AUTH_FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = isHttp
      ? (exception.getResponse() as { code?: string })['code'] ??
        CODE_BY_STATUS[status] ??
        'INTERNAL_ERROR'
      : 'INTERNAL_ERROR';

    let message: string;
    if (isHttp) {
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : (body as { message?: string })['message'] ?? exception.message;
    } else {
      message = exception instanceof Error ? exception.message : 'Internal server error';
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ErrorResponse = {
      error: { code, message },
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(payload);
  }
}
