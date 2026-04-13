// CallSheetData — parsed catering information extracted from a call sheet PDF.

import mongoose, { Schema } from 'mongoose';

const mealSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['breakfast', 'lunch', 'dinner', 'craft_service', 'other'],
      required: true,
    },
    startTime: { type: String, default: '' },   // "08:00"
    endTime: { type: String, default: '' },     // "09:00" or empty for open-ended
    location: { type: String, default: '' },
    notes: { type: String, default: '' },       // e.g. "running lunch"
  },
  { _id: false }
);

const crewContactSchema = new Schema(
  {
    name: { type: String, required: true },
    role: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  { _id: false }
);

const callSheetDataSchema = new Schema(
  {
    projectId: { type: String, required: true, index: true },
    shootDay: { type: Number, default: 0 },
    date: { type: String, default: '' },             // "2021-11-19" or original text
    productionName: { type: String, default: '' },
    meals: { type: [mealSchema], default: [] },
    wrapTime: { type: String, default: '' },
    unitCall: { type: String, default: '' },
    estimatedHeadcount: { type: Number, default: 0 },
    cateringBase: { type: String, default: '' },
    crewContacts: { type: [crewContactSchema], default: [] },
    rawText: { type: String, default: '' },          // full extracted text for debugging
    sourceFileName: { type: String, default: '' },
    created: { type: Number, required: true },
  },
  { timestamps: true }
);

callSheetDataSchema.index({ projectId: 1, created: -1 });

export const CallSheetData = mongoose.model('CallSheetData', callSheetDataSchema);
