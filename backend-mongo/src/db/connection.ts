import mongoose from 'mongoose';
import { env } from '../config/env.js';

mongoose.set('strictQuery', true);

export async function connectDb(uri: string = env.mongoUri): Promise<typeof mongoose> {
  mongoose.connection.on('error', (e) => console.error('[mongo] error', e.message));
  mongoose.connection.on('disconnected', () => console.warn('[mongo] disconnected'));
  await mongoose.connect(uri, {
    autoIndex: env.autoIndex,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    retryWrites: true,
    w: 'majority',
  });
  return mongoose;
}

export const disconnectDb = (): Promise<void> => mongoose.disconnect();

/** True when a ping reaches the server. */
export async function dbHealthy(): Promise<boolean> {
  try {
    await mongoose.connection.db?.admin().ping();
    return mongoose.connection.readyState === 1;
  } catch {
    return false;
  }
}
