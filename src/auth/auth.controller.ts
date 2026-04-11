// Auth controller — register / login / me / logout.

import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../shared-modules/models/User.js';
import { sendSuccess } from '../shared/response.js';
import { errors } from '../shared/errors.js';

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'caterer', 'member']).default('member'),
  adminAccess: z.boolean().optional(),
  department: z.string().optional(),
  deviceId: z.string().optional(),
  projectId: z.string().optional(),
});

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest(parsed.error.issues[0]?.message ?? 'invalid_body');

  const existing = await User.findOne({ email: parsed.data.email });
  if (existing) throw errors.badRequest('email_already_registered');

  const user = await User.create(parsed.data);
  const token = signToken(String(user._id));
  sendSuccess(
    res,
    { token, user: user.toJSON() },
    'registered',
    201
  );
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_body');

  const user = await User.findOne({ email: parsed.data.email });
  if (!user) throw errors.unauthorized();

  const ok = await (user as unknown as { comparePassword: (p: string) => Promise<boolean> })
    .comparePassword(parsed.data.password);
  if (!ok) throw errors.unauthorized();

  const token = signToken(String(user._id));
  sendSuccess(res, { token, user: (user as unknown as { toJSON: () => unknown }).toJSON() }, 'logged_in');
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw errors.unauthorized();
  sendSuccess(res, { user: req.user }, 'profile');
}

function signToken(id: string): string {
  return jwt.sign({ id }, env.JWT_SECRET, { expiresIn: '30d' });
}
