// Direct chat controller — 1:1 and group conversations outside of units.
//
// Endpoints:
//   GET    /api/v2/conversations              — list my conversations
//   POST   /api/v2/conversations              — create 1:1 or group
//   GET    /api/v2/conversations/:id/messages  — paginated messages
//   POST   /api/v2/conversations/:id/messages  — send message
//   GET    /api/v2/contacts                   — all users in my project

import type { Request, Response } from 'express';
import { z } from 'zod';
import { Conversation } from './models/Conversation.js';
import { DirectMessage } from './models/DirectMessage.js';
import { User } from '../shared-modules/models/User.js';
import { sendSuccess } from '../shared/response.js';
import { errors } from '../shared/errors.js';
import { toSnakeCase } from '../shared/wireFormat.js';

// We import emitToUser from socket to push DM notifications
import { emitToUser } from '../socket.js';

// ────────── List Conversations ──────────

export async function listConversations(req: Request, res: Response): Promise<void> {
  const userId = req.user?._id;
  if (!userId) throw errors.unauthorized();

  const convos = await Conversation.find({ participants: userId })
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .lean();

  // Resolve participant names
  const allParticipantIds = [...new Set(convos.flatMap((c) => c.participants.map(String)))];
  const users = await User.find({ _id: { $in: allParticipantIds } })
    .select('_id name avatar role department phone gsmPhone')
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const enriched = convos.map((c) => ({
    ...c,
    participantDetails: c.participants.map((pid) => userMap.get(String(pid)) ?? { _id: String(pid), name: 'Unknown' }),
  }));

  sendSuccess(res, enriched, 'conversations_fetched');
}

// ────────── Create Conversation ──────────

const createConvoSchema = z.object({
  participantIds: z.array(z.string()).min(1),
  type: z.enum(['direct', 'group']).default('direct'),
  name: z.string().optional().default(''),
});

export async function createConversation(req: Request, res: Response): Promise<void> {
  const userId = req.user?._id;
  if (!userId) throw errors.unauthorized();

  const parsed = createConvoSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_conversation_body');

  const allParticipants = [...new Set([userId, ...parsed.data.participantIds])];

  // For 1:1, check if conversation already exists between these two users
  if (parsed.data.type === 'direct' && allParticipants.length === 2) {
    const existing = await Conversation.findOne({
      type: 'direct',
      participants: { $all: allParticipants, $size: 2 },
    }).lean();
    if (existing) {
      sendSuccess(res, existing, 'conversation_exists');
      return;
    }
  }

  const convo = await Conversation.create({
    participants: allParticipants,
    type: parsed.data.type,
    name: parsed.data.name,
    projectId: req.user?.projectId ?? '',
    createdBy: userId,
    lastMessageAt: 0,
    created: Date.now(),
  });

  sendSuccess(res, convo.toObject(), 'conversation_created', 201);
}

// ────────── List Messages in Conversation ──────────

export async function listConversationMessages(req: Request, res: Response): Promise<void> {
  const userId = req.user?._id;
  const { id } = req.params;

  // Verify the user is a participant
  const convo = await Conversation.findOne({ _id: id, participants: userId }).lean();
  if (!convo) throw errors.notFound('conversation');

  const lastUpdated = Number(req.query.lastUpdated) || Date.now();

  const messages = await DirectMessage.find({
    conversationId: id,
    deleted: 0,
    created: { $lt: lastUpdated },
  })
    .sort({ created: -1 })
    .limit(200)
    .lean();

  messages.reverse();
  sendSuccess(res, messages, 'dm_messages_fetched');
}

// ────────── Send Message ──────────

const sendDmSchema = z.object({
  message: z.string().min(1),
  messageType: z.enum(['text', 'image', 'video', 'audio', 'document']).default('text'),
  attachment: z.any().optional(),
});

export async function sendConversationMessage(req: Request, res: Response): Promise<void> {
  const userId = req.user?._id;
  const { id } = req.params;

  const convo = await Conversation.findOne({ _id: id, participants: userId }).lean();
  if (!convo) throw errors.notFound('conversation');

  const parsed = sendDmSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_dm_body');

  const now = Date.now();
  const msg = await DirectMessage.create({
    conversationId: id,
    sender: userId,
    message: parsed.data.message,
    messageType: parsed.data.messageType,
    attachment: parsed.data.attachment ?? null,
    created: now,
    updated: now,
  });

  // Update conversation's lastMessageAt
  await Conversation.updateOne({ _id: id }, { lastMessageAt: now });

  const plain = msg.toObject();
  const snaked = toSnakeCase(plain);

  // Notify all participants (except sender) via their user socket room.
  // DMs use the 'catering' namespace since there's no dedicated DM namespace.
  for (const pid of convo.participants) {
    const pidStr = String(pid);
    if (pidStr !== userId) {
      emitToUser('catering', pidStr, 'dm:new' as 'chat:new', snaked);
    }
  }

  sendSuccess(res, plain, 'dm_sent', 201);
}

// ────────── Contacts (all users in the project) ──────────

export async function listContacts(req: Request, res: Response): Promise<void> {
  const projectId = req.user?.projectId;
  if (!projectId) {
    sendSuccess(res, [], 'contacts_fetched');
    return;
  }

  const users = await User.find({ projectId })
    .select('_id name email role adminAccess department avatar phone gsmPhone')
    .sort({ role: 1, name: 1 })
    .lean();

  sendSuccess(res, users, 'contacts_fetched');
}
