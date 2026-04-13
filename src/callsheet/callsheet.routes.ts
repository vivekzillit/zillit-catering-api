// Call sheet routes — mounted at /api/v2/callsheet.

import { Router } from 'express';
import { asyncHandler } from '../shared/response.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  callsheetUpload,
  parseCallSheet,
  getLatestCallSheet,
  updateCallSheet,
} from './callsheet.controller.js';

export const callsheetRouter = Router();

callsheetRouter.use(authMiddleware);

callsheetRouter.post('/parse', callsheetUpload, asyncHandler(parseCallSheet));
callsheetRouter.get('/latest', asyncHandler(getLatestCallSheet));
callsheetRouter.put('/:id', asyncHandler(updateCallSheet));
