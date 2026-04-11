// Chat controller — matches the iOS catering/chat endpoint surface.
//
// Endpoints:
//   GET    /<m>/chat/:unitId/:lastUpdated/:orderType
//   POST   /<m>/chat
//   PUT    /<m>/chat/:messageId
//   DELETE /<m>/chat/:messageId
//   PUT    /<m>/chat/delete/chats
//   PUT    /<m>/chat/archive

import type { Request, Response } from 'express';
import { z } from 'zod';
import { ChatMessage } from '../models/ChatMessage.js';
import { sendSuccess } from '../../shared/response.js';
import { errors } from '../../shared/errors.js';
import type { ModuleId } from '../../shared/types.js';
import { emitChatEvent } from '../../socket.js';
import { toSnakeCase } from '../../shared/wireFormat.js';

/**
 * GET /<m>/chat/:unitId/:lastUpdated/:orderType
 *
 * Visibility rules (matches iOS app):
 *  - Caterers / admins see ALL messages in the unit (broadcast + directed).
 *  - Regular members only see:
 *      · broadcast (receiver: null), OR
 *      · messages they sent, OR
 *      · messages directed to them.
 *
 * `orderType` = "previous" → messages created BEFORE lastUpdated (history)
 *               "next"     → messages created AFTER lastUpdated
 */
export async function listMessages(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { unitId, lastUpdated, orderType } = req.params;
  if (!unitId) throw errors.unitIdRequired();

  const ts = Number(lastUpdated) || Date.now();
  const isPrevious = orderType === 'previous';
  const user = req.user;
  const userId = user?._id;

  const tsFilter = isPrevious ? { $lt: ts } : { $gt: ts };
  const isAdmin =
    user?.role === 'admin' || user?.role === 'caterer' || user?.adminAccess === true;

  const baseQuery: Record<string, unknown> = {
    module: moduleId,
    unitId,
    deleted: 0,
    created: tsFilter,
  };

  const query = isAdmin
    ? baseQuery
    : {
        ...baseQuery,
        $or: [{ receiver: null }, { sender: userId }, { receiver: userId }],
      };

  const messages = await ChatMessage.find(query)
    .sort({ created: isPrevious ? -1 : 1 })
    .limit(200)
    .lean();

  // Return in ascending order (oldest first) regardless of query direction
  if (isPrevious) messages.reverse();

  sendSuccess(res, messages, 'unit_chat_fetched');
}

const sendSchema = z.object({
  unitId: z.string().min(1),
  message: z.string().min(1),
  uniqueId: z.string().min(1),
  messageGroup: z.number(),
  messageType: z
    .enum(['text', 'image', 'video', 'audio', 'document', 'location'])
    .default('text'),
  messageTranslation: z.string().optional(),
  receiver: z.string().nullable().optional(),
  pinned: z.number().optional(),
  dateTime: z.number().optional(),
  attachment: z.any().optional(),
});

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.issues[0]?.message ?? 'invalid_chat_body');
  }
  if (!parsed.data.unitId) throw errors.unitIdRequired();

  const now = parsed.data.dateTime ?? Date.now();
  const doc = await ChatMessage.create({
    ...parsed.data,
    module: moduleId,
    sender: req.user?._id,
    receiver: parsed.data.receiver || null,
    created: now,
    updated: now,
    projectId: req.user?.projectId || undefined,
  });

  const plain = doc.toObject();
  emitChatEvent(moduleId, parsed.data.unitId, 'chat:new', toSnakeCase(plain));

  sendSuccess(res, plain, 'message_sent', 201);
}

const editSchema = z.object({
  message: z.string().min(1),
  messageTranslation: z.string().optional(),
});

export async function editMessage(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { messageId } = req.params;
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_chat_body');

  const doc = await ChatMessage.findOneAndUpdate(
    { _id: messageId, module: moduleId, sender: req.user?._id },
    { ...parsed.data, updated: Date.now(), edited: Date.now() },
    { new: true }
  ).lean();
  if (!doc) throw errors.notFound('message');

  emitChatEvent(moduleId, String(doc.unitId), 'chat:update', toSnakeCase(doc));
  sendSuccess(res, doc, 'message_updated');
}

export async function deleteMessage(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { messageId } = req.params;

  const doc = await ChatMessage.findOne({ _id: messageId, module: moduleId }).lean();
  if (!doc) throw errors.notFound('message');

  await ChatMessage.updateOne(
    { _id: messageId, module: moduleId },
    { deleted: 1, updated: Date.now() }
  );
  emitChatEvent(moduleId, String(doc.unitId), 'chat:delete', {
    _id: messageId,
    unit_id: String(doc.unitId),
  });
  sendSuccess(res, { chatIds: [messageId] }, 'message_deleted');
}

const bulkDeleteSchema = z.object({
  chatIds: z.array(z.string()).min(1),
});

export async function bulkDeleteMessages(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const parsed = bulkDeleteSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_chat_body');

  await ChatMessage.updateMany(
    { _id: { $in: parsed.data.chatIds }, module: moduleId },
    { deleted: 1, updated: Date.now() }
  );
  sendSuccess(res, { chatIds: parsed.data.chatIds }, 'messages_deleted');
}

const archiveSchema = z.object({
  chatIds: z.array(z.string()).min(1),
});

export async function archiveMessages(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const parsed = archiveSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_chat_body');

  const docs = await ChatMessage.updateMany(
    { _id: { $in: parsed.data.chatIds }, module: moduleId },
    { archived: 1, updated: Date.now() }
  );
  sendSuccess(res, { home: docs }, 'messages_archived');
}
