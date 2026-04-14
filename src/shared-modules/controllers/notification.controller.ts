// Notification controller — list + mark-read.
//
// Endpoints:
//   GET  /<m>/notifications        — list unread for current user
//   PUT  /<m>/notifications/:id/read — mark one read
//   PUT  /<m>/notifications/read-all — mark all read

import type { Request, Response } from 'express';
import { Notification } from '../models/Notification.js';
import { sendSuccess } from '../../shared/response.js';
import { errors } from '../../shared/errors.js';

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const userId = req.user?._id;
  if (!userId) throw errors.unauthorized();

  const notifs = await Notification.find({ userId, read: false })
    .sort({ created: -1 })
    .limit(50)
    .lean();

  sendSuccess(res, notifs, 'notifications_fetched');
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const userId = req.user?._id;
  const { notifId } = req.params;

  await Notification.updateOne(
    { _id: notifId, userId },
    { read: true }
  );

  sendSuccess(res, { _id: notifId }, 'notification_read');
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const userId = req.user?._id;

  await Notification.updateMany(
    { userId, read: false },
    { read: true }
  );

  sendSuccess(res, {}, 'all_notifications_read');
}
