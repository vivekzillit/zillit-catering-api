// Central error middleware. Converts thrown errors (AppError or otherwise)
// into the standard `{status:0,...}` envelope matching the iOS client.

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors.js';
import { sendError } from '../shared/response.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    sendError(res, err.message, err.httpStatus);
    return;
  }
  if (err instanceof Error) {
    console.error('[error]', err.message, err.stack);
    sendError(res, err.message || 'internal_error', 500);
    return;
  }
  console.error('[error:unknown]', err);
  sendError(res, 'internal_error', 500);
}
