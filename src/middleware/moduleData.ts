// Decode + validate the iOS `moduledata` header.
//
// The header is an AES-256-CBC hex string whose plaintext is a JSON object:
//   { user_id, project_id, device_id, time_stamp }
//
// In development we allow the header to be absent (for curl/testing), but
// when present we validate:
//   - structure (4 required string/number fields)
//   - freshness (time_stamp within ±MODULEDATA_MAX_SKEW_MS of now)

import type { Request, Response, NextFunction } from 'express';
import { decodeModuleData } from '../shared/crypto.js';
import { env } from '../config/env.js';
import { errors } from '../shared/errors.js';

export function moduleDataMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const hex = req.header('moduledata');
  if (!hex) {
    // In dev we allow missing moduledata so tests can curl endpoints
    // without implementing the crypto locally. In production it's required.
    if (env.NODE_ENV !== 'production') return next();
    return next(errors.invalidModuledata());
  }

  const payload = decodeModuleData(hex);
  if (!payload) return next(errors.invalidModuledata());

  const skew = Math.abs(Date.now() - payload.time_stamp);
  if (skew > env.MODULEDATA_MAX_SKEW_MS) {
    return next(errors.invalidModuledata());
  }

  req.moduleData = payload;
  next();
}
