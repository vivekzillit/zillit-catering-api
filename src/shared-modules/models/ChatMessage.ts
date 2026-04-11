// ChatMessage — port of iOS HomeRecord + nested CommentResponse.
//
// The `message` and `comments[].message` fields are stored AES-encrypted
// (hex) so client and server agree on the wire bytes. The backend never
// decrypts them; it just routes them based on sender/receiver/unitId.
// Clients decrypt for display.

import mongoose, { Schema } from 'mongoose';
import { MODULE_IDS } from '../../shared/types.js';

const attachmentSchema = new Schema(
  {
    media: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    contentType: { type: String, default: '' },
    contentSubtype: { type: String, default: '' },
    name: { type: String, default: '' },
    caption: { type: String, default: '' },
    height: { type: Number },
    width: { type: Number },
    duration: { type: Number },
    fileSize: { type: String, default: '' },
    region: { type: String, default: '' },
    bucket: { type: String, default: '' },
    key: { type: String, default: '' },
  },
  { _id: false }
);

const commentSchema = new Schema(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true }, // AES-encrypted hex
    messageTranslation: { type: String, default: '' },
    attachment: { type: attachmentSchema, default: null },
    messageType: { type: String, default: 'text' },
    created: { type: Number, required: true },
    updated: { type: Number, required: true },
    deleted: { type: Number, default: 0 },
  },
  { _id: true, timestamps: false }
);

const chatMessageSchema = new Schema(
  {
    module: { type: String, enum: MODULE_IDS, required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },

    uniqueId: { type: String, required: true },
    messageGroup: { type: Number, required: true },

    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiver: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    message: { type: String, required: true }, // AES-encrypted hex
    messageTranslation: { type: String, default: '' },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'location'],
      default: 'text',
    },
    attachment: { type: attachmentSchema, default: null },

    pinned: { type: Number, default: 0 },
    locationPinned: { type: Number, default: 0 },
    archived: { type: Number, default: 0 },
    edited: { type: Number, default: 0 },
    deleted: { type: Number, default: 0 },

    created: { type: Number, required: true }, // epoch ms
    updated: { type: Number, required: true },

    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true }
);

chatMessageSchema.index({ module: 1, unitId: 1, deleted: 1, created: -1 });
chatMessageSchema.index({ receiver: 1, sender: 1 });

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
