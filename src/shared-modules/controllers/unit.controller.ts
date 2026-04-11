// Unit controller — scoped per module via req.moduleId.
//
// Endpoints:
//   GET  /<m>/unit                     — list enabled units
//   GET  /<m>/unit/:unitId/members     — list team members (name + role)
//   POST /<m>/unit                     — create unit (admin only)
//   PUT  /<m>/unit/:unitId             — update unit (admin only)

import type { Request, Response } from 'express';
import { z } from 'zod';
import { Unit } from '../models/Unit.js';
import { User } from '../models/User.js';
import { sendSuccess } from '../../shared/response.js';
import { errors } from '../../shared/errors.js';
import type { ModuleId } from '../../shared/types.js';

export async function listUnits(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const units = await Unit.find({ module: moduleId, enabled: true })
    .sort({ createdAt: 1 })
    .lean();
  sendSuccess(res, units);
}

/**
 * GET /<m>/unit/:unitId/members — resolve the unit's team members to
 * {_id, name, role, adminAccess} so the compose UI's "Select User"
 * dropdown can show real names. Falls back to all users in the project if
 * the unit has no teamMembers[] configured yet.
 */
export async function listUnitMembers(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { unitId } = req.params;
  if (!unitId) throw errors.unitIdRequired();

  const unit = await Unit.findOne({ _id: unitId, module: moduleId }).lean();
  if (!unit) throw errors.notFound('unit');

  const memberIds = (unit.teamMembers ?? [])
    .filter((m) => m.enabled !== false)
    .map((m) => m.userId)
    .filter(Boolean);

  const filter = memberIds.length > 0
    ? { _id: { $in: memberIds } }
    : { projectId: req.user?.projectId ?? '' };

  const users = await User.find(filter)
    .select('_id name role adminAccess avatar department email')
    .lean();

  sendSuccess(res, users, 'unit_members_fetched');
}

const createSchema = z.object({
  unitName: z.string().min(1),
  identifier: z.string().optional(),
  privateUnit: z.boolean().optional(),
  systemDefined: z.boolean().optional(),
});

export async function createUnit(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_unit_body');

  const unit = await Unit.create({
    ...parsed.data,
    module: moduleId,
    projectId: req.user?.projectId || undefined,
    enabled: true,
  });
  sendSuccess(res, unit.toObject(), 'unit_created', 201);
}

const updateSchema = createSchema.partial().extend({
  enabled: z.boolean().optional(),
});

export async function updateUnit(req: Request, res: Response): Promise<void> {
  const moduleId = req.moduleId as ModuleId;
  const { unitId } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw errors.badRequest('invalid_unit_body');

  const unit = await Unit.findOneAndUpdate(
    { _id: unitId, module: moduleId },
    parsed.data,
    { new: true }
  ).lean();
  if (!unit) throw errors.notFound('unit');
  sendSuccess(res, unit, 'unit_updated');
}
