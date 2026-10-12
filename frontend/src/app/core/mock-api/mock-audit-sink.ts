/** What the compliance modules need from the audit log: append an event. The real chain lives in mock-audit.ts. */
export interface AuditInput {
  actorId?: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditSink {
  record(input: AuditInput): void;
}

/** Used while the demo data is seeded: seeding is not a user action and leaves no trail. */
export const NO_AUDIT: AuditSink = { record: () => undefined };
