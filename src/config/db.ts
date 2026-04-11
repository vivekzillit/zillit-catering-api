import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URL);
  console.log(`[db] connected to ${env.MONGO_URL}`);
}
