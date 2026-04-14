// Notification — in-app notification queue. Created when a caterer marks
// an order "ready" so the member gets alerted.

import mongoose, { Schema } from 'mongoose';

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['order_ready', 'order_accepted', 'new_message'],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    read: { type: Boolean, default: false },
    created: { type: Number, required: true },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, created: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
