// Order controller — place, list, update status, get summaries.
//
// Endpoints:
//   POST   /<m>/order                     — place an order
//   GET    /<m>/order?unitId=&status=      — list orders (caterer)
//   GET    /<m>/order/my                   — my orders (any user)
//   PUT    /<m>/order/:orderId/status      — update status (caterer)
//   GET    /<m>/order/summary/:unitId      — per-item + per-person breakdown
//   GET    /<m>/order/stats/:unitId        — total received / served / last served

import type { Request, Response } from 'express';
import { z } from 'zod';
import { Order } from '../models/Order.js';
import { sendSuccess } from '../../shared/response.js';
import { errors } from '../../shared/errors.js';
import type { ModuleId } from '../../shared/types.js';
import { emitChatEvent, emitToUser } from '../../socket.js';
import { toSnakeCase } from '../../shared/wireFormat.js';
import { Notification } from '../models/Notification.js';

// VIP departments / roles — orders from these get priority: 'vip'
const VIP_ROLES = new Set(['admin', 'caterer']);
const VIP_DEPARTMENTS = new Set([
  'producer', 'production', 'director', 'actor', 'talent', 'executive',
]);

function isVip(role?: string, department?: string): boolean {
  if (role && VIP_ROLES.has(role)) return true;
  if (department && VIP_DEPARTMENTS.has(department.toLowerCase())) return true;
  return false;
}

// ────────── Place Order ──────────

const placeOrderSchema = z.object({
  unitId: z.string().min(1),
  items: z.array(
    z.object({
      menuItemId: z.string().min(1),
      name: z.string().min(1),
      category: z.string().optional().default(''),
    })
  ).min(1),
  notes: z.string().optional().default(''),
});

export async function placeOrder(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const parsed = placeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.issues[0]?.message ?? 'invalid_order');
  }

  const user = req.user!;
  const now = Date.now();

  const doc = await Order.create({
    module: moduleId,
    unitId: parsed.data.unitId,
    projectId: user.projectId ?? '',
    userId: user._id,
    userName: user.name,
    userDepartment: user.department ?? '',
    userRole: user.role,
    items: parsed.data.items,
    notes: parsed.data.notes,
    status: 'pending',
    priority: isVip(user.role, user.department) ? 'vip' : 'normal',
    created: now,
    updated: now,
  });

  const plain = doc.toObject();
  // Notify all caterers in the unit
  emitChatEvent(moduleId, parsed.data.unitId, 'order:new' as 'chat:new', toSnakeCase(plain));

  sendSuccess(res, plain, 'order_placed', 201);
}

// ────────── List Orders (caterer) ──────────

export async function listOrders(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const unitId = req.query.unitId as string | undefined;
  const status = req.query.status as string | undefined;

  const filter: Record<string, unknown> = { module: moduleId };
  if (unitId) filter.unitId = unitId;
  if (status) filter.status = status;

  // Only today's orders by default (since midnight UTC)
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  filter.created = { $gte: startOfDay.getTime() };

  const orders = await Order.find(filter)
    .sort({ priority: -1, created: -1 })    // VIP first, then newest
    .limit(500)
    .lean();

  sendSuccess(res, orders, 'orders_fetched');
}

// ────────── My Orders (any user) ──────────

export async function myOrders(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const userId = req.user?._id;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const orders = await Order.find({
    module: moduleId,
    userId,
    created: { $gte: startOfDay.getTime() },
  })
    .sort({ created: -1 })
    .limit(100)
    .lean();

  sendSuccess(res, orders, 'my_orders_fetched');
}

// ────────── Update Status ──────────

const statusSchema = z.object({
  status: z.enum(['accepted', 'preparing', 'ready', 'served', 'cancelled']),
});

export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { orderId } = req.params;
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_status');

  const now = Date.now();
  const update: Record<string, unknown> = {
    status: parsed.data.status,
    updated: now,
  };
  if (parsed.data.status === 'ready') update.notifiedReadyAt = now;
  if (parsed.data.status === 'served') update.servedAt = now;

  const doc = await Order.findOneAndUpdate(
    { _id: orderId, module: moduleId },
    update,
    { new: true }
  ).lean();
  if (!doc) throw errors.notFound('order');

  const plain = toSnakeCase(doc);

  // Notify the unit room (caterer dashboards update live)
  emitChatEvent(moduleId, String(doc.unitId), 'order:status' as 'chat:update', plain);
  // Notify the orderer directly (for "ready" notification)
  emitToUser(moduleId, String(doc.userId), 'order:status' as 'chat:update', plain);

  // When order is marked "ready", create a persistent notification for the
  // orderer and emit a real-time notification event so the bell + toast fire.
  if (parsed.data.status === 'ready') {
    try {
      const notif = await Notification.create({
        userId: doc.userId,
        type: 'order_ready',
        title: 'Your order is ready!',
        body: `Your order from ${doc.userName ? '' : ''}${doc.items.map((i) => i.name).join(', ')} is ready for pickup.`,
        orderId: doc._id,
        read: false,
        created: now,
      });
      emitToUser(moduleId, String(doc.userId), 'notification:new' as 'chat:new', toSnakeCase(notif.toObject()));
    } catch (err) {
      console.error('Failed to create ready notification', err);
    }
  }

  sendSuccess(res, doc, 'order_status_updated');
}

// ────────── Per-Item + Per-Person Summary ──────────

export async function orderSummary(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { unitId } = req.params;
  if (!unitId) throw errors.unitIdRequired();

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const orders = await Order.find({
    module: moduleId,
    unitId,
    status: { $ne: 'cancelled' },
    created: { $gte: startOfDay.getTime() },
  }).lean();

  // Per-item: how many orders include each menu item
  const perItem: Record<string, { name: string; category: string; count: number; users: string[] }> = {};
  for (const order of orders) {
    for (const item of order.items) {
      const key = String(item.menuItemId);
      if (!perItem[key]) {
        perItem[key] = { name: item.name, category: item.category ?? '', count: 0, users: [] };
      }
      perItem[key].count += 1;
      perItem[key].users.push(order.userName);
    }
  }

  // Per-person: each user's items + status
  const perPerson = orders.map((o) => ({
    _id: o._id,
    userId: o.userId,
    userName: o.userName,
    userDepartment: o.userDepartment,
    userRole: o.userRole,
    priority: o.priority,
    items: o.items,
    notes: o.notes,
    status: o.status,
    created: o.created,
    servedAt: o.servedAt,
  }));

  sendSuccess(res, {
    perItem: Object.values(perItem).sort((a, b) => b.count - a.count),
    perPerson: perPerson.sort((a, b) => {
      // VIP first, then by creation time
      if (a.priority === 'vip' && b.priority !== 'vip') return -1;
      if (a.priority !== 'vip' && b.priority === 'vip') return 1;
      return (a.created ?? 0) - (b.created ?? 0);
    }),
    totalOrders: orders.length,
  }, 'order_summary_fetched');
}

// ────────── Stats (received / served / last served) ──────────

export async function orderStats(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { unitId } = req.params;
  if (!unitId) throw errors.unitIdRequired();

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const orders = await Order.find({
    module: moduleId,
    unitId,
    status: { $ne: 'cancelled' },
    created: { $gte: startOfDay.getTime() },
  })
    .select('status servedAt userName created')
    .lean();

  const totalReceived = orders.length;
  const servedOrders = orders.filter((o) => o.status === 'served');
  const totalServed = servedOrders.length;
  const remaining = totalReceived - totalServed;

  // Last person served
  let lastServedAt = 0;
  let lastServedUserName = '';
  for (const o of servedOrders) {
    if ((o.servedAt ?? 0) > lastServedAt) {
      lastServedAt = o.servedAt ?? 0;
      lastServedUserName = o.userName;
    }
  }

  sendSuccess(res, {
    totalReceived,
    totalServed,
    remaining,
    lastServedAt,
    lastServedUserName,
  }, 'order_stats_fetched');
}
