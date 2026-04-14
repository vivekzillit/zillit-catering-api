// Seed script — populates dev data so the frontend has something to render.
// Run via `npm run seed`.

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDb } from '../config/db.js';
import { User } from '../shared-modules/models/User.js';
import { Unit } from '../shared-modules/models/Unit.js';

const CATERING_UNITS = [
  { unitName: 'breakfast_label', identifier: 'breakfast', startTime: '06:00', endTime: '09:00' },
  { unitName: 'lunch_label', identifier: 'lunch', startTime: '12:00', endTime: '14:00' },
  { unitName: 'dinner_label', identifier: 'dinner', startTime: '18:00', endTime: '21:00' },
];

// Craft service: single "Menu" unit — caterer adds custom units as needed.
const CRAFTSERVICE_UNITS = [
  { unitName: 'menu_label', identifier: 'menu', startTime: '', endTime: '' },
];

async function main(): Promise<void> {
  await connectDb();

  // Mongoose `pre('save')` hooks don't fire on findOneAndUpdate, so the
  // password must be hashed manually before upsert or login will fail.
  const hashedPassword = await bcrypt.hash('password123', 10);

  // --- Users ---
  const caterer = await User.findOneAndUpdate(
    { email: 'caterer@zillit.dev' },
    {
      name: 'Vivek Mishra',
      email: 'caterer@zillit.dev',
      password: hashedPassword,
      role: 'caterer',
      adminAccess: true,
      department: 'Catering',
      deviceId: 'C4150FA3-105F-4276-A21C-65AD79B5EB28',
      projectId: '67f4c341d7b27a11acf84d57',
      phone: '+1-555-0100',
      gsmPhone: '+44-7717-650812',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const member = await User.findOneAndUpdate(
    { email: 'member@zillit.dev' },
    {
      name: 'iPhone Red Device',
      email: 'member@zillit.dev',
      password: hashedPassword,
      role: 'member',
      adminAccess: false,
      department: 'Production',
      deviceId: '7B3C0B33-A74E-49EB-B56A-2C6E9E02F41A',
      projectId: '67f4c341d7b27a11acf84d57',
      phone: '+1-555-0200',
      gsmPhone: '+44-7508-897772',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('[seed] users seeded:', caterer.email, member.email);

  // --- Units ---
  for (const u of CATERING_UNITS) {
    await Unit.findOneAndUpdate(
      { module: 'catering', unitName: u.unitName },
      {
        ...u,
        module: 'catering',
        projectId: caterer.projectId,
        enabled: true,
        teamMembers: [
          { userId: caterer._id, enabled: true },
          { userId: member._id, enabled: true },
        ],
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  for (const u of CRAFTSERVICE_UNITS) {
    await Unit.findOneAndUpdate(
      { module: 'craftservice', unitName: u.unitName },
      {
        ...u,
        module: 'craftservice',
        projectId: caterer.projectId,
        enabled: true,
        teamMembers: [
          { userId: caterer._id, enabled: true },
          { userId: member._id, enabled: true },
        ],
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log(`[seed] units seeded: ${CATERING_UNITS.length} catering, ${CRAFTSERVICE_UNITS.length} craft service`);

  await mongoose.disconnect();
  console.log('[seed] done');
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
