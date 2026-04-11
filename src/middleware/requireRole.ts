// Role gate — rejects any user whose `role` isn't in the allow-list.
// Example: `requireRole('admin', 'caterer')` lets caterers and admins through.

import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../shared/types.js';
import { errors } from '../shared/errors.js';

export function requireRole(...allowed: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(errors.unauthorized());
    // adminAccess bypasses role checks (matches iOS pattern)
    if (req.user.adminAccess) return next();
    if (!allowed.includes(req.user.role)) return next(errors.forbidden());
    next();
  };
}
