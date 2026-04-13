// App bootstrap — Express + Mongo + Socket.io.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import './shared/types.js'; // side-effect: augment Express.Request
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { moduleRouter } from './shared-modules/moduleRouter.js';
import { authRouter } from './auth/auth.routes.js';
import { uploadRouter } from './uploads/upload.controller.js';
import { errorHandler } from './middleware/errorHandler.js';
import { camelBodyMiddleware } from './middleware/camelBody.js';
import { attachSocket } from './socket.js';
import { sendSuccess } from './shared/response.js';
import { directChatRouter } from './direct-chat/directChat.routes.js';
import { callsheetRouter } from './callsheet/callsheet.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  await connectDb();

  const app = express();

  // Trust proxy so rate-limit + IP logging work behind nginx/cloudflare
  app.set('trust proxy', 1);

  // Security
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // CORS allow-list:
  //   - Exact origins from env.CORS_ORIGIN (comma-separated), with trailing
  //     slashes normalised so `https://x.com` matches `https://x.com/`.
  //   - Any *.onrender.com subdomain (safety net so the frontend Render URL
  //     always works even if CORS_ORIGIN gets mis-typed).
  //   - Tools without an Origin header (curl, mobile apps) are allowed
  //     because there's no browser same-origin policy to enforce.
  const allowList = new Set(
    env.CORS_ORIGIN
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean)
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const normalised = origin.replace(/\/$/, '');
        if (allowList.has(normalised)) return callback(null, true);
        if (/^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(normalised)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    })
  );

  // Rate limits
  app.use(
    '/api/v2/auth',
    rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false })
  );
  app.use(
    '/api/v2',
    rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false })
  );

  app.use(express.json({ limit: '5mb' }));

  // Static upload serving
  app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

  // Health + routes
  app.get('/health', (_req, res) => sendSuccess(res, { ok: true }, 'healthy'));
  // Auth accepts plain camelCase bodies; leave untouched.
  app.use('/api/v2/auth', authRouter);
  // Upload accepts multipart; leave untouched.
  app.use('/api/v2/upload', uploadRouter);
  // Direct chat + contacts (not module-scoped).
  app.use('/api/v2', camelBodyMiddleware, directChatRouter);
  // Call sheet PDF parsing (not module-scoped; multer handles the body).
  app.use('/api/v2/callsheet', callsheetRouter);
  // All module routes receive snake_case JSON bodies — camelize before
  // zod schemas see them so controllers stay idiomatic TypeScript.
  app.use('/api/v2/catering', camelBodyMiddleware, moduleRouter('catering'));
  app.use('/api/v2/craftservice', camelBodyMiddleware, moduleRouter('craftservice'));

  // Catch-all 404 (must be after all routes)
  app.use((_req, res) => {
    res.status(404).json({
      status: 0,
      message: 'not_found',
      messageElements: [],
      data: {},
    });
  });

  app.use(errorHandler);

  const server = http.createServer(app);
  attachSocket(server);

  server.listen(env.PORT, () => {
    console.log(`[api] listening on http://localhost:${env.PORT}`);
    console.log(`[api] modules: /api/v2/catering, /api/v2/craftservice`);
  });
}

main().catch((err) => {
  console.error('[api] fatal', err);
  process.exit(1);
});
