import { FsLineKey } from '../../features/reports-fs/fs.models';
import { AuditSink, NO_AUDIT } from './mock-audit-sink';

export interface StoredFsMapping {
  /** Explicit choices only; accounts without an entry follow the starter template. */
  map: Record<string, FsLineKey>;
  confirmedBy?: string;
  confirmedAt?: string;
}

/** The in-memory "database" of the Phase 5 compliance modules. Rules live in the handlers; this only stores. */
export class ComplianceStore {
  readonly fsMappings = new Map<string, StoredFsMapping>();
  audit: AuditSink = NO_AUDIT;
  private seq = 7000;

  nextId(prefix: string): string {
    return `${prefix}-${++this.seq}`;
  }

  fsMappingOf(ledgerId: string): StoredFsMapping {
    let m = this.fsMappings.get(ledgerId);
    if (!m) {
      m = { map: {} };
      this.fsMappings.set(ledgerId, m);
    }
    return m;
  }
}
