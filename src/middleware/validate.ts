// Zod validation middleware. Rejects with 400 if req.body fails the schema.

import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { toCamelCase } from '../shared/wireFormat.js';
import { AppError } from '../shared/errors.js';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Incoming bodies are snake_case on the wire; convert to camelCase
    // before validating so schemas can be written in TS convention.
    const camelBody = toCamelCase(req.body);
    const parsed = schema.safeParse(camelBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const msg = firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'invalid_body';
      return next(new AppError(msg, 400));
    }
    req.body = parsed.data;
    next();
  };
}
