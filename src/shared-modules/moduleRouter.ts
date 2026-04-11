// moduleRouter — factory that produces an Express Router with the full
// catering/craft-service surface. Mounted twice (under /catering and
// /craftservice) so the two modules are symmetric.
//
// Every request gets `req.moduleId` set so controllers can scope their DB
// queries to the right module.

import { Router } from 'express';
import type { ModuleId } from '../shared/types.js';
import { asyncHandler } from '../shared/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { moduleDataMiddleware } from '../middleware/moduleData.js';
import { requireRole } from '../middleware/requireRole.js';

import {
  listUnits,
  listUnitMembers,
  createUnit,
  updateUnit,
} from './controllers/unit.controller.js';
import {
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from './controllers/menu.controller.js';
import {
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  bulkDeleteMessages,
  archiveMessages,
} from './controllers/chat.controller.js';
import {
  createComment,
  updateComment,
  deleteComment,
} from './controllers/comment.controller.js';

export function moduleRouter(moduleId: ModuleId): Router {
  const router = Router();

  // Every request in this router picks up the module discriminator, auth,
  // and moduledata validation before touching any controller.
  router.use((req, _res, next) => {
    req.moduleId = moduleId;
    next();
  });
  router.use(moduleDataMiddleware);
  router.use(authMiddleware);

  // --- Units ---
  router.get('/unit', asyncHandler(listUnits));
  router.get('/unit/:unitId/members', asyncHandler(listUnitMembers));
  router.post('/unit', requireRole('admin', 'caterer'), asyncHandler(createUnit));
  router.put('/unit/:unitId', requireRole('admin', 'caterer'), asyncHandler(updateUnit));

  // --- Menu CRUD ---
  router.get('/menu/:unitId', asyncHandler(listMenuItems));
  router.post('/menu', requireRole('admin', 'caterer'), asyncHandler(createMenuItem));
  router.put('/menu/:menuItemId', requireRole('admin', 'caterer'), asyncHandler(updateMenuItem));
  router.delete('/menu/:menuItemId', requireRole('admin', 'caterer'), asyncHandler(deleteMenuItem));

  // --- Chat ---
  router.get('/chat/:unitId/:lastUpdated/:orderType', asyncHandler(listMessages));
  router.post('/chat', asyncHandler(sendMessage));
  router.put('/chat/delete/chats', asyncHandler(bulkDeleteMessages));
  router.put('/chat/archive', asyncHandler(archiveMessages));
  router.put('/chat/:messageId', asyncHandler(editMessage));
  router.delete('/chat/:messageId', asyncHandler(deleteMessage));

  // --- Comments ---
  router.post('/chat/comments/:messageId', asyncHandler(createComment));
  router.put('/chat/comments/:messageId/:commentId', asyncHandler(updateComment));
  router.delete('/chat/comments/:messageId/:commentId', asyncHandler(deleteComment));

  return router;
}
