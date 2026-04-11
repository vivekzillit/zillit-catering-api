// Converts snake_case JSON request bodies to camelCase so downstream
// controllers / zod schemas can be written in idiomatic TypeScript.
//
// Only touches plain-object bodies — passes through multipart/form-data,
// string, null, arrays of non-objects, etc.

import type { Request, Response, NextFunction } from 'express';
import { toCamelCase } from '../shared/wireFormat.js';

export function camelBodyMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const body = req.body;
  if (body != null && typeof body === 'object') {
    try {
      req.body = toCamelCase(body);
    } catch {
      /* leave body alone if anything blows up */
    }
  }
  next();
}
