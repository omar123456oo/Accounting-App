import { Schema, Types } from 'mongoose';

/** Every tenant-owned collection carries organizationId. Replaces Postgres row-level security: queries must be scoped with it. */
export function tenantPlugin(schema: Schema): void {
  schema.add({ organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true } });
}

export const oid = (id: string | Types.ObjectId): Types.ObjectId => new Types.ObjectId(id);
