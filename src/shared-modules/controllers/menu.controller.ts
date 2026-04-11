// Menu controller — CRUD for module-scoped menu items.
//
// Endpoints:
//   GET    /<m>/menu/:unitId
//   POST   /<m>/menu
//   PUT    /<m>/menu/:menuItemId
//   DELETE /<m>/menu/:menuItemId

import type { Request, Response } from 'express';
import { z } from 'zod';
import { MenuItem } from '../models/MenuItem.js';
import { sendSuccess } from '../../shared/response.js';
import { errors } from '../../shared/errors.js';
import type { ModuleId } from '../../shared/types.js';

const customNutritionFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.string(),
  unit: z.string().default(''),
});

const nutritionSchema = z
  .object({
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
    fiber: z.number().optional(),
    sugar: z.number().optional(),
    sodium: z.number().optional(),
    vitamins: z.array(z.string()).optional(),
    customFields: z.array(customNutritionFieldSchema).optional(),
  })
  .nullable()
  .optional();

const imageSchema = z.object({
  key: z.string().optional(),
  thumbnail: z.string().optional(),
  url: z.string().optional(),
  bucket: z.string().optional(),
  region: z.string().optional(),
  contentType: z.string().optional(),
  fileSize: z.string().optional(),
});

const createSchema = z.object({
  unitId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.string().optional(),
  available: z.boolean().default(true),
  servingSize: z.string().optional(),
  nutrition: nutritionSchema,
  dietaryTags: z.array(z.string()).optional(),
  allergenWarnings: z.array(z.string()).optional(),
  images: z.array(imageSchema).optional(),
});

export async function listMenuItems(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { unitId } = req.params;
  if (!unitId) throw errors.unitIdRequired();

  const items = await MenuItem.find({
    module: moduleId,
    unitId,
    deleted: 0,
  })
    .sort({ createdAt: -1 })
    .lean();
  sendSuccess(res, items, 'menu_list_fetched');
}

export async function createMenuItem(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.issues[0]?.message ?? 'invalid_menu_body');
  }
  if (!parsed.data.unitId) throw errors.unitIdRequired();

  const doc = await MenuItem.create({
    ...parsed.data,
    module: moduleId,
    createdBy: req.user?._id,
    projectId: req.user?.projectId || undefined,
  });
  sendSuccess(res, doc.toObject(), 'menu_item_created_successfully', 201);
}

const updateSchema = createSchema.partial();

export async function updateMenuItem(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { menuItemId } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_menu_body');

  const doc = await MenuItem.findOneAndUpdate(
    { _id: menuItemId, module: moduleId, deleted: 0 },
    parsed.data,
    { new: true }
  ).lean();
  if (!doc) throw errors.notFound('menu_item');
  sendSuccess(res, doc, 'menu_item_updated');
}

export async function deleteMenuItem(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { menuItemId } = req.params;
  const result = await MenuItem.updateOne(
    { _id: menuItemId, module: moduleId },
    { deleted: 1 }
  );
  if (result.matchedCount === 0) throw errors.notFound('menu_item');
  sendSuccess(res, { deletedCount: result.modifiedCount }, 'menu_item_deleted');
}
