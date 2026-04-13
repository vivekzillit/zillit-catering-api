// DirectMessage — a single message within a Conversation. Encrypted on
// the wire just like unit-scoped chat messages.

import mongoose, { Schema } from 'mongoose';

const directMessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },        // AES-encrypted hex
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document'],
      default: 'text',
    },
    attachment: {
      type: new Schema(
        {
          key: { type: String, default: '' },
          url: { type: String, default: '' },
          thumbnail: { type: String, default: '' },
          name: { type: String, default: '' },
          contentType: { type: String, default: '' },
          fileSize: { type: String, default: '' },
        },
        { _id: false }
      ),
      default: null,
    },
    created: { type: Number, required: true },
    updated: { type: Number, required: true },
    deleted: { type: Number, default: 0 },
  },
  { timestamps: true }
);

directMessageSchema.index({ conversationId: 1, created: -1 });

export const DirectMessage = mongoose.model('DirectMessage', directMessageSchema);
