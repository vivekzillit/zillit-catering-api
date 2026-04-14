// Call sheet controller — upload PDF, parse, store, retrieve, manual override.
//
// Endpoints:
//   POST /api/v2/callsheet/parse   — upload PDF → extract text → regex parse → store
//   GET  /api/v2/callsheet/latest  — get latest parsed call sheet for project
//   PUT  /api/v2/callsheet/:id     — manual override of parsed fields

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import type { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { CallSheetData } from './models/CallSheetData.js';
import { Unit } from '../shared-modules/models/Unit.js';
import { sendSuccess } from '../shared/response.js';
import { errors } from '../shared/errors.js';
import { parseCallSheetText } from './parser.js';

// Multer for PDF uploads (temp files, cleaned up after parsing)
const upload = multer({
  dest: '/tmp/zillit-callsheet-uploads',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'));
  },
});

export const callsheetUpload = upload.single('file');

export async function parseCallSheet(req: Request, res: Response): Promise<void> {
  const f = req.file;
  if (!f) throw errors.badRequest('pdf_file_required');

  let rawText = '';
  try {
    // Use pdftotext (poppler) to extract text. Render's Node image has
    // poppler-utils installed, and we install it locally via brew.
    rawText = execSync(`pdftotext "${f.path}" -`, {
      encoding: 'utf-8',
      timeout: 15_000,
    });
  } catch (err) {
    // Fallback: if pdftotext isn't available, store with empty rawText
    // so the caterer can still manually fill in the fields.
    console.warn('pdftotext failed, storing with empty rawText:', err);
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(f.path); } catch { /* ignore */ }
  }

  const parsed = parseCallSheetText(rawText);

  const doc = await CallSheetData.create({
    projectId: req.user?.projectId ?? '',
    ...parsed,
    rawText,
    sourceFileName: f.originalname,
    created: Date.now(),
  });

  // Auto-sync parsed meal times to matching catering units so the unit
  // tabs display the correct serving window.
  const syncedUnits: string[] = [];
  if (parsed.meals.length > 0 && req.user?.projectId) {
    const mealTypeToUnit: Record<string, string> = {
      breakfast: 'breakfast',
      lunch: 'lunch',
      dinner: 'dinner',
      craft_service: 'craft',
    };
    for (const meal of parsed.meals) {
      const keyword = mealTypeToUnit[meal.type] ?? meal.type;
      // Match by unit name containing the meal keyword (case-insensitive)
      const unit = await Unit.findOneAndUpdate(
        {
          projectId: req.user.projectId,
          enabled: true,
          unitName: { $regex: keyword, $options: 'i' },
        },
        {
          startTime: meal.startTime,
          endTime: meal.endTime,
          servingLocation: meal.location || undefined,
        },
        { new: true }
      );
      if (unit) syncedUnits.push(`${unit.unitName}: ${meal.startTime}-${meal.endTime}`);
    }
  }

  sendSuccess(res, { ...doc.toObject(), syncedUnits }, 'callsheet_parsed', 201);
}

/** POST /api/v2/callsheet/manual — create a call sheet from manually entered data (no PDF). */
export async function createManualCallSheet(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const doc = await CallSheetData.create({
    projectId: req.user?.projectId ?? '',
    shootDay: body.shootDay ?? 0,
    date: body.date ?? '',
    productionName: body.productionName ?? '',
    meals: body.meals ?? [],
    wrapTime: body.wrapTime ?? '',
    unitCall: body.unitCall ?? '',
    estimatedHeadcount: body.estimatedHeadcount ?? 0,
    cateringBase: body.cateringBase ?? '',
    crewContacts: [],
    rawText: '',
    sourceFileName: 'manual_entry',
    created: Date.now(),
  });
  sendSuccess(res, doc.toObject(), 'callsheet_created', 201);
}

export async function getLatestCallSheet(req: Request, res: Response): Promise<void> {
  const projectId = req.user?.projectId;
  if (!projectId) {
    sendSuccess(res, null, 'no_project');
    return;
  }

  const doc = await CallSheetData.findOne({ projectId })
    .sort({ created: -1 })
    .lean();

  sendSuccess(res, doc, doc ? 'callsheet_fetched' : 'no_callsheet');
}

const updateSchema = z.object({
  shootDay: z.number().optional(),
  date: z.string().optional(),
  productionName: z.string().optional(),
  meals: z.array(z.object({
    type: z.enum(['breakfast', 'lunch', 'dinner', 'craft_service', 'other']),
    startTime: z.string().default(''),
    endTime: z.string().default(''),
    location: z.string().default(''),
    notes: z.string().default(''),
  })).optional(),
  wrapTime: z.string().optional(),
  unitCall: z.string().optional(),
  estimatedHeadcount: z.number().optional(),
  cateringBase: z.string().optional(),
}).partial();

export async function updateCallSheet(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_callsheet_body');

  const doc = await CallSheetData.findByIdAndUpdate(
    id,
    parsed.data,
    { new: true }
  ).lean();
  if (!doc) throw errors.notFound('callsheet');

  sendSuccess(res, doc, 'callsheet_updated');
}
