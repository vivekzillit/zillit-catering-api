// Conversation — a 1:1 or group thread between users, independent of
// catering/craft-service units. Used for direct messaging and the
// permanent "All Caterers" group.

import mongoose, { Schema } from 'mongoose';

const conversationSchema = new Schema(
  {
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: [(v: unknown[]) => v.length >= 2, 'Need at least 2 participants'],
    },
    type: {
      type: String,
      enum: ['direct', 'group'],
      required: true,
    },
    name: { type: String, default: '' },             // display name for groups
    projectId: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastMessageAt: { type: Number, default: 0 },     // epoch ms, for sort
    created: { type: Number, required: true },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ projectId: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
