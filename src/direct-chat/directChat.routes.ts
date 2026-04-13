// Direct chat + contacts routes — mounted at /api/v2 (not module-scoped).

import { Router } from 'express';
import { asyncHandler } from '../shared/response.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  listConversations,
  createConversation,
  listConversationMessages,
  sendConversationMessage,
  listContacts,
} from './directChat.controller.js';

export const directChatRouter = Router();

directChatRouter.use(authMiddleware);

directChatRouter.get('/conversations', asyncHandler(listConversations));
directChatRouter.post('/conversations', asyncHandler(createConversation));
directChatRouter.get('/conversations/:id/messages', asyncHandler(listConversationMessages));
directChatRouter.post('/conversations/:id/messages', asyncHandler(sendConversationMessage));
directChatRouter.get('/contacts', asyncHandler(listContacts));
