import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

/** Tells the server that a report was exported, so the export lands in the audit trail. Best effort: a failure never blocks the download. */
@Injectable({ providedIn: 'root' })
export class AuditExportService {
  private readonly http = inject(HttpClient);

  log(report: string, ledgerEntityId?: string): void {
    this.http.post('/api/v1/staff/audit/exports', { report, ...(ledgerEntityId ? { ledgerEntityId } : {}) }).subscribe({ error: () => undefined });
  }
}
