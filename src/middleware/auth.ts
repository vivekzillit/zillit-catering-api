// JWT auth middleware. Populates req.user from a valid bearer token.

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../shared-modules/models/User.js';
import { errors } from '../shared/errors.js';

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.header('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return next(errors.unauthorized());
  }
  const token = header.slice(7).trim();
  if (!token) return next(errors.unauthorized());

  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    return next(errors.unauthorized());
  }
  if (!decoded || typeof decoded !== 'object' || !decoded.id) {
    return next(errors.unauthorized());
  }

  const user = await User.findById(decoded.id).lean();
  if (!user) return next(errors.unauthorized());

  req.user = {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    adminAccess: !!user.adminAccess,
    department: user.department ?? '',
    deviceId: user.deviceId,
    projectId: user.projectId,
    phone: user.phone ?? '',
    gsmPhone: user.gsmPhone ?? '',
  };
  next();
}
