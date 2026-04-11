// Simple local upload endpoint. Matches the iOS signed-URL flow structurally
// (returns `{key, url, thumbnail}`) but uses local disk storage for dev.
// Swap for S3 signed URLs later.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { sendSuccess } from '../shared/response.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

export const uploadRouter = Router();

uploadRouter.post('/', authMiddleware, upload.single('file'), (req, res) => {
  const f = req.file;
  if (!f) {
    return res.status(400).json({
      status: 0,
      message: 'file_required',
      messageElements: [],
      data: {},
    });
  }
  const publicUrl = `/uploads/${f.filename}`;
  sendSuccess(res, {
    key: f.filename,
    url: publicUrl,
    thumbnail: publicUrl,
    contentType: f.mimetype,
    fileSize: String(f.size),
  });
});
