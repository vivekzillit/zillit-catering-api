import { Router } from 'express';
import { asyncHandler } from '../shared/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { register, login, me } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', asyncHandler(register));
authRouter.post('/login', asyncHandler(login));
authRouter.get('/me', authMiddleware, asyncHandler(me));
