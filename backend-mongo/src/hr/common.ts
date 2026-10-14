import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Types } from 'mongoose';

export class HttpError extends Error {
  constructor(public status: number, message: string, public errors?: Record<string, string[]>) { super(message); }
}

/** Express 4 does not catch rejected promises. */
export const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** A well-formed ObjectId string, or null. A malformed id is treated like an unknown one (404), never a 500. */
export const idOf = (v: unknown): Types.ObjectId | null =>
  typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v) ? new Types.ObjectId(v) : null;

export const orgOf = (req: Request): Types.ObjectId => req.auth!.organizationId;
export const notFound = (): HttpError => new HttpError(404, 'Not found.');
export const forbidden = (): HttpError => new HttpError(403, 'Forbidden.');

export class Errors {
  readonly map: Record<string, string[]> = {};
  add(field: string, message: string): void { (this.map[field] ??= []).push(message); }
  get any(): boolean { return Object.keys(this.map).length > 0; }
  throwIfAny(): void { if (this.any) throw new HttpError(422, 'The given data was invalid.', this.map); }
}

export const text = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (v: unknown): v is string => typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export const todayIso = (): string => new Date().toISOString().slice(0, 10);
export const addDays = (d: string, n: number): string => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

export function pageOf(q: Request['query']): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const isDuplicateKey = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;
