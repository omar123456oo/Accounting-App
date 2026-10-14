import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';
import { ClientFormat } from '../clients/client-format';
import { EngageApiService, Side } from './engage-api.service';
import { AppNotification } from './engage.models';

/** The bell in the header: unread count, a short list, and a link to each item. Refreshes after every navigation. */
@Component({
  selector: 'app-notification-bell',
  imports: [TranslatePipe],
  template: `
    <div class="position-relative no-print">
      <button type="button" class="btn btn-outline-secondary btn-sm position-relative" aria-haspopup="true" [attr.aria-expanded]="open()" [attr.aria-label]="'notifications.title' | translate" (click)="toggle()">
        <i class="fa-solid fa-bell" aria-hidden="true"></i>
        @if (unread() > 0) {
          <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger">{{ unread() }}<span class="visually-hidden"> {{ 'notifications.unread' | translate }}</span></span>
        }
      </button>
      @if (open()) {
        <div class="card shadow-sm position-absolute end-0 mt-1 panel" role="region" [attr.aria-label]="'notifications.title' | translate">
          <div class="card-header d-flex justify-content-between align-items-center py-2">
            <strong>{{ 'notifications.title' | translate }}</strong>
            @if (unread() > 0) {
              <button type="button" class="btn btn-link btn-sm p-0" (click)="readAll()">{{ 'notifications.markAll' | translate }}</button>
            }
          </div>
          <ul class="list-group list-group-flush items">
            @for (n of items(); track n.id) {
              <li class="list-group-item list-group-item-action p-0">
                <button type="button" class="btn w-100 text-start py-2 px-3" [class.fw-semibold]="!n.read" (click)="go(n)">
                  <span class="d-block small">{{ 'notifications.kind.' + n.kind | translate: n.params }}</span>
                  <span class="d-block small text-body-secondary">{{ format.dateTime(n.at) }}</span>
                </button>
              </li>
            } @empty {
              <li class="list-group-item text-body-secondary small">{{ 'notifications.none' | translate }}</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: `
    .panel {
      inline-size: 20rem;
      z-index: 1050;
    }
    .items {
      max-block-size: 20rem;
      overflow-y: auto;
    }
  `,
})
export class NotificationBell implements OnInit {
  readonly side = input<Side>('staff');
  protected readonly format = inject(ClientFormat);
  private readonly api = inject(EngageApiService);
  private readonly router = inject(Router);
  protected readonly items = signal<AppNotification[]>([]);
  protected readonly unread = signal(0);
  protected readonly open = signal(false);

  /** Inputs are not set in the constructor, so the first load waits for ngOnInit (the portal bell must not ask the staff API). */
  ngOnInit(): void {
    this.refresh();
  }

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef))).subscribe(() => this.refresh());
  }

  private refresh(): void {
    this.api.notifications(this.side()).subscribe({
      next: (r) => {
        this.items.set(r.data);
        this.unread.set(r.meta.unread);
      },
      error: () => undefined,
    });
  }

  protected toggle(): void {
    this.open.update((o) => !o);
  }

  protected go(n: AppNotification): void {
    this.open.set(false);
    this.api.markRead(this.side(), n.id).subscribe({ complete: () => this.refresh() });
    void this.router.navigateByUrl(n.link);
  }

  protected readAll(): void {
    this.api.markAllRead(this.side()).subscribe({ complete: () => this.refresh() });
  }
}
