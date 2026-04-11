// Standard response envelope — matches iOS `ZLGenericResponse`:
//   { status, message, messageElements, data }
//
// All endpoints use `sendSuccess` / `sendError` to keep the shape consistent.

import type { Request, Response, NextFunction } from 'express';
import { toSnakeCase } from './wireFormat.js';

export interface ApiEnvelope<T = unknown> {
  status: number;
  message: string;
  messageElements: string[];
  data: T;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'ok',
  httpStatus = 200
): Response {
  const body: ApiEnvelope<unknown> = {
    status: 1,
    message,
    messageElements: [],
    data: toSnakeCase(data) ?? {},
  };
  return res.status(httpStatus).json(body);
}

export function sendError(
  res: Response,
  message: string,
  httpStatus = 400
): Response {
  const body: ApiEnvelope<Record<string, never>> = {
    status: 0,
    message,
    messageElements: [],
    data: {},
  };
  return res.status(httpStatus).json(body);
}

/**
 * Wrap an async route handler so thrown errors reach the central error
 * middleware instead of crashing the process.
 */
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
