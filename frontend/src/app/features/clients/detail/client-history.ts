import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AssignableUser, ClientChangeEvent } from '../client.models';
import { ClientFormat } from '../client-format';
import { ClientsApiService } from '../clients-api.service';

/** Read-only audit trail of changes to the client's critical fields. */
@Component({
  selector: 'app-client-history',
  imports: [TranslatePipe],
  template: `
    <h2 class="h5 mb-3">{{ 'clients.history.title' | translate }}</h2>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (events().length === 0) {
      <div class="alert alert-secondary" role="status">{{ 'clients.history.empty' | translate }}</div>
    } @else {
      <div class="table-responsive">
        <table class="table">
          <caption class="visually-hidden">{{ 'clients.history.title' | translate }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ 'clients.history.field' | translate }}</th>
              <th scope="col">{{ 'clients.history.oldValue' | translate }}</th>
              <th scope="col">{{ 'clients.history.newValue' | translate }}</th>
              <th scope="col">{{ 'clients.history.changedBy' | translate }}</th>
              <th scope="col">{{ 'clients.history.changedAt' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (e of events(); track e.id) {
              <tr>
                <td>{{ 'clients.fields.' + e.field | translate }}</td>
                <td>{{ value(e.field, e.oldValue) | translate }}</td>
                <td>{{ value(e.field, e.newValue) | translate }}</td>
                <td>{{ e.changedBy }}</td>
                <td>{{ format.dateTime(e.changedAt) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class ClientHistory {
  private readonly api = inject(ClientsApiService);
  protected readonly format = inject(ClientFormat);

  readonly clientId = input.required<string>();
  /** Changes whenever the client is updated, so the trail reloads. */
  readonly version = input('');

  protected readonly events = signal<ClientChangeEvent[]>([]);
  protected readonly failed = signal(false);
  private users: AssignableUser[] = [];

  constructor() {
    this.api.assignableUsers().subscribe((u) => (this.users = u));
    effect(() => {
      const id = this.clientId();
      this.version();
      untracked(() => this.api.history(id).subscribe({ next: (e) => this.events.set(e), error: () => this.failed.set(true) }));
    });
  }

  /** Returns a translation key for enumerations, otherwise the text itself (the pipe passes unknown keys through). */
  protected value(field: string, raw: string): string {
    if (field === 'status') return `clients.status.${raw}`;
    if (field === 'legalForm') return `clients.legalForm.${raw}`;
    if (field === 'assignedAccountantIds') return raw.split(', ').filter(Boolean).map((id) => this.users.find((u) => u.id === id)?.name ?? id).join(', ');
    return raw;
  }
}
