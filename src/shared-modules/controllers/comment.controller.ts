// Comment controller — reply/edit/delete comments nested on a parent chat
// message. Matches iOS catering/chat/comments endpoint surface.
//
//   POST   /<m>/chat/comments/:messageId
//   PUT    /<m>/chat/comments/:messageId/:commentId
//   DELETE /<m>/chat/comments/:messageId/:commentId

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ChatMessage } from '../models/ChatMessage.js';
import { sendSuccess } from '../../shared/response.js';
import { errors } from '../../shared/errors.js';
import type { ModuleId } from '../../shared/types.js';
import { emitChatEvent } from '../../socket.js';
import { toSnakeCase } from '../../shared/wireFormat.js';

const createCommentSchema = z.object({
  unitId: z.string().min(1),
  message: z.string().min(1),
  messageType: z.string().default('text'),
  messageTranslation: z.string().optional(),
  attachment: z.any().optional(),
});

export async function createComment(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { messageId } = req.params;
  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_comment_body');

  const now = Date.now();
  const commentSubdoc = {
    _id: new mongoose.Types.ObjectId(),
    sender: req.user?._id,
    message: parsed.data.message,
    messageTranslation: parsed.data.messageTranslation ?? '',
    messageType: parsed.data.messageType,
    attachment: parsed.data.attachment ?? null,
    created: now,
    updated: now,
    deleted: 0,
  };

  const parent = await ChatMessage.findOneAndUpdate(
    { _id: messageId, module: moduleId },
    { $push: { comments: commentSubdoc }, updated: now },
    { new: true }
  ).lean();
  if (!parent) throw errors.notFound('message');

  emitChatEvent(moduleId, String(parent.unitId), 'chat:update', toSnakeCase(parent));
  sendSuccess(res, parent, 'comment_added', 201);
}

const updateCommentSchema = z.object({
  unitId: z.string().min(1),
  message: z.string().min(1),
  messageTranslation: z.string().optional(),
});

export async function updateComment(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { messageId, commentId } = req.params;
  const parsed = updateCommentSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_comment_body');

  const now = Date.now();
  const parent = await ChatMessage.findOneAndUpdate(
    { _id: messageId, module: moduleId, 'comments._id': commentId },
    {
      $set: {
        'comments.$.message': parsed.data.message,
        'comments.$.messageTranslation': parsed.data.messageTranslation ?? '',
        'comments.$.updated': now,
      },
      updated: now,
    },
    { new: true }
  ).lean();
  if (!parent) throw errors.notFound('comment');

  emitChatEvent(moduleId, String(parent.unitId), 'chat:update', toSnakeCase(parent));
  sendSuccess(res, parent, 'comment_updated');
}

export async function deleteComment(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { messageId, commentId } = req.params;

  const now = Date.now();
  const parent = await ChatMessage.findOneAndUpdate(
    { _id: messageId, module: moduleId, 'comments._id': commentId },
    {
      $set: { 'comments.$.deleted': 1, 'comments.$.updated': now },
      updated: now,
    },
    { new: true }
  ).lean();
  if (!parent) throw errors.notFound('comment');

  emitChatEvent(moduleId, String(parent.unitId), 'chat:update', toSnakeCase(parent));
  sendSuccess(res, parent, 'comment_deleted');
}
