// Socket.io realtime broadcasting. Namespace per module, rooms per unit and
// per user so both broadcast and private-DM events can be targeted.
//
// Controllers import `emitChatEvent` / `emitToUser` to push updates after
// mutations without having to hold a reference to the IOServer themselves.

import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, Namespace } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { MODULE_IDS, type ModuleId } from './shared/types.js';

// Module → namespace lookup populated during attachSocket(). Undefined
// before the HTTP server starts so emitters are no-ops in tests.
const namespaces: Partial<Record<ModuleId, Namespace>> = {};

export function attachSocket(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    },
  });

  for (const moduleId of MODULE_IDS) {
    const ns = io.of(`/ws/${moduleId}`);
    namespaces[moduleId] = ns;

    ns.use((socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('unauthorized'));
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
        (socket.data as { userId?: string }).userId = decoded.id;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });

    ns.on('connection', (socket) => {
      const userId = (socket.data as { userId?: string }).userId;
      if (userId) socket.join(`user:${userId}`);

      socket.on('join:unit', (unitId: string) => {
        if (typeof unitId === 'string' && unitId.length > 0) {
          socket.join(`unit:${unitId}`);
        }
      });
      socket.on('leave:unit', (unitId: string) => {
        if (typeof unitId === 'string' && unitId.length > 0) {
          socket.leave(`unit:${unitId}`);
        }
      });
    });
  }

  return io;
}

/**
 * Broadcast a chat event to every client listening on `unit:<unitId>` in
 * the module's namespace. Clients filter per-user visibility locally.
 */
export function emitChatEvent(
  moduleId: ModuleId,
  unitId: string,
  event: 'chat:new' | 'chat:update' | 'chat:delete',
  payload: unknown
): void {
  const ns = namespaces[moduleId];
  if (!ns || !unitId) return;
  ns.to(`unit:${unitId}`).emit(event, payload);
}

/**
 * Emit an event directly to a single user's socket room. Useful for
 * bootstrapping DMs to clients that haven't joined the unit room yet.
 */
export function emitToUser(
  moduleId: ModuleId,
  userId: string,
  event: 'chat:new' | 'chat:update' | 'chat:delete',
  payload: unknown
): void {
  const ns = namespaces[moduleId];
  if (!ns || !userId) return;
  ns.to(`user:${userId}`).emit(event, payload);
}
