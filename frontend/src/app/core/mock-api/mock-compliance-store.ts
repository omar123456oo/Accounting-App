import { FsLineKey } from '../../features/reports-fs/fs.models';
import { Adjustment, Attachment, CalendarRule, DeadlineReminder, ObligationType, ReturnEvent, ReturnKind, ReturnState, RuleSet, Submission, TaxProfile, WithholdingRecord, ReturnCalc } from '../../features/tax/tax.models';
import { AuditSink, NO_AUDIT } from './mock-audit-sink';

export interface StoredFsMapping {
  /** Explicit choices only; accounts without an entry follow the starter template. */
  map: Record<string, FsLineKey>;
  confirmedBy?: string;
  confirmedAt?: string;
}

/** A return as the mock keeps it: the calculation is live until approval, then frozen. */
export interface StoredReturn {
  id: string;
  ledgerEntityId: string;
  kind: ReturnKind;
  periodStart: string;
  periodEnd: string;
  version: number;
  amendsReturnId?: string;
  supersededById?: string;
  state: ReturnState;
  preparedBy: string;
  preparedByName: string;
  reviewedBy?: string;
  reviewedByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  /** Set when the return is approved: from then on this snapshot is what the return shows. */
  frozen?: ReturnCalc;
  worksheet: { adjustments: Adjustment[]; ruleId?: string };
  attachments: Attachment[];
  submission: Submission;
  history: ReturnEvent[];
}

/** The in-memory "database" of the Phase 5 compliance modules. Rules live in the handlers; this only stores. */
export class ComplianceStore {
  readonly fsMappings = new Map<string, StoredFsMapping>();
  audit: AuditSink = NO_AUDIT;
  obligationTypes: ObligationType[] = [];
  calendarRules: CalendarRule[] = [];
  ruleSets: RuleSet[] = [];
  readonly profiles = new Map<string, TaxProfile>();
  returns: StoredReturn[] = [];
  withholding: WithholdingRecord[] = [];
  readonly reminders = new Map<string, DeadlineReminder[]>();
  /** File bytes of attachments and evidence, keyed by "returnId:attachmentId". */
  readonly blobs = new Map<string, Blob>();
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
