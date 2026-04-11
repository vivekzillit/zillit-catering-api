// MenuItem — 1:1 port of the iOS MenuItemResponse schema with full
// nutrition + dietary tags + allergen warnings + custom nutrition fields +
// images. Scoped per module (catering or craftservice).

import mongoose, { Schema } from 'mongoose';
import { MODULE_IDS } from '../../shared/types.js';

const customNutritionFieldSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    value: { type: String, required: true },
    unit: { type: String, default: '' },
  },
  { _id: false }
);

const nutritionSchema = new Schema(
  {
    calories: { type: Number },
    protein: { type: Number },
    carbs: { type: Number },
    fat: { type: Number },
    fiber: { type: Number },
    sugar: { type: Number },
    sodium: { type: Number },
    vitamins: { type: [String], default: [] },
    customFields: { type: [customNutritionFieldSchema], default: [] },
  },
  { _id: false }
);

const menuImageSchema = new Schema(
  {
    key: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    url: { type: String, default: '' },
    bucket: { type: String, default: '' },
    region: { type: String, default: '' },
    contentType: { type: String, default: '' },
    fileSize: { type: String, default: '' },
  },
  { _id: false }
);

const menuItemSchema = new Schema(
  {
    module: { type: String, enum: MODULE_IDS, required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },

    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, default: '' },
    available: { type: Boolean, default: true },
    servingSize: { type: String, default: '' },

    nutrition: { type: nutritionSchema, default: null },
    dietaryTags: { type: [String], default: [] },
    allergenWarnings: { type: [String], default: [] },
    images: { type: [menuImageSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deleted: { type: Number, default: 0 },
  },
  { timestamps: true }
);

menuItemSchema.index({ module: 1, unitId: 1, deleted: 1, createdAt: -1 });

export const MenuItem = mongoose.model('MenuItem', menuItemSchema);
