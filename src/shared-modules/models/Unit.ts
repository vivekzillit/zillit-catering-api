// Unit — catering/craft-service unit (e.g. Breakfast / Lunch / Dinner).
// Each document is scoped to one module via the `module` discriminator.

import mongoose, { Schema } from 'mongoose';
import { MODULE_IDS } from '../../shared/types.js';

const teamMemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const unitSchema = new Schema(
  {
    module: {
      type: String,
      enum: MODULE_IDS,
      required: true,
      index: true,
    },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    unitName: { type: String, required: true, trim: true },
    identifier: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    privateUnit: { type: Boolean, default: false },
    hasDownloadAccess: { type: Boolean, default: true },
    isUnitHead: { type: Boolean, default: false },
    systemDefined: { type: Boolean, default: false },
    teamMembers: { type: [teamMemberSchema], default: [] },
  },
  { timestamps: true }
);

unitSchema.index({ module: 1, projectId: 1, enabled: 1 });

export const Unit = mongoose.model('Unit', unitSchema);
