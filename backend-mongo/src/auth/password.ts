import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await scryptAsync(pw, salt, 64)).toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, salt, hex] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = await scryptAsync(pw, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

/** Verified against when the e-mail is unknown, so response time does not reveal whether an account exists. */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));
