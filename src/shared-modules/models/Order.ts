// Order — a user's meal order for a specific unit (breakfast, lunch, etc.).
//
// Replaces the old chat-based poll/vote system. Each order is a standalone
// document with status tracking, priority flagging, and serve-time recording.

import mongoose, { Schema } from 'mongoose';
import { MODULE_IDS } from '../../shared/types.js';

const orderItemSchema = new Schema(
  {
    menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },       // snapshot at order time
    category: { type: String, default: '' },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    module: { type: String, enum: MODULE_IDS, required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    projectId: { type: String, default: '' },

    // Who placed the order (denormalized for fast display)
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, required: true },
    userDepartment: { type: String, default: '' },
    userRole: { type: String, default: 'member' },

    items: { type: [orderItemSchema], required: true, validate: [(v: unknown[]) => v.length > 0, 'At least one item'] },
    notes: { type: String, default: '' },

    status: {
      type: String,
      enum: ['pending', 'accepted', 'preparing', 'ready', 'served', 'cancelled'],
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['normal', 'vip'],
      default: 'normal',
    },

    // Timestamps for tracking
    notifiedReadyAt: { type: Number, default: 0 },   // when caterer marked "ready"
    servedAt: { type: Number, default: 0 },           // when caterer marked "served"
    created: { type: Number, required: true },         // epoch ms
    updated: { type: Number, required: true },
  },
  { timestamps: true }
);

orderSchema.index({ module: 1, unitId: 1, status: 1, created: -1 });
orderSchema.index({ module: 1, unitId: 1, userId: 1 });

export const Order = mongoose.model('Order', orderSchema);
