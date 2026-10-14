import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary';

export interface ChartItem {
  /** Literal text (names, months). Leave empty and set `labelKey` for translated labels, so a language switch updates the chart. */
  label: string;
  labelKey?: string;
  value: number;
  /** Printed value; defaults to the number. Money passes its formatted decimal string here. */
  display?: string;
  tone?: Tone;
}

/** Headline number with a one-line explanation. */
@Component({
  selector: 'app-kpi-card',
  template: `
    <div class="card h-100 kpi">
      <div class="card-body">
        <div class="small text-body-secondary d-flex align-items-center gap-2">
          @if (icon()) {
            <i class="fa-solid fa-{{ icon() }}" aria-hidden="true"></i>
          }
          {{ label() }}
        </div>
        <div class="fs-3 fw-bold" [class]="'text-' + tone()" dir="auto">{{ value() }}</div>
        @if (hint()) {
          <div class="small text-body-secondary">{{ hint() }}</div>
        }
      </div>
    </div>
  `,
  styles: `
    .kpi {
      border-inline-start: 4px solid var(--bs-border-color);
    }
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input('');
  readonly icon = input('');
  readonly tone = input<'body' | 'success' | 'warning' | 'danger' | 'primary'>('body');
}

/** Horizontal bars with the value written next to each: nothing depends on colour alone. */
@Component({
  selector: 'app-bar-list',
  imports: [TranslatePipe],
  template: `
    @if (items().length === 0) {
      <div class="text-body-secondary small" role="status">{{ empty() }}</div>
    } @else {
      <ul class="list-unstyled mb-0" [attr.aria-label]="label()">
        @for (it of items(); track it.labelKey ?? it.label) {
          <li class="mb-2">
            <div class="d-flex justify-content-between small">
              <span class="text-truncate me-2">{{ it.labelKey ? (it.labelKey | translate) : it.label }}</span>
              <span class="fw-semibold text-nowrap" dir="ltr">{{ it.display ?? it.value }}</span>
            </div>
            <div class="progress" role="presentation" style="block-size: 0.6rem">
              <div class="progress-bar" [class]="'bg-' + (it.tone ?? 'primary')" [style.inline-size.%]="width(it.value)"></div>
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class BarList {
  readonly items = input.required<readonly ChartItem[]>();
  readonly label = input('');
  readonly empty = input('');
  private readonly max = computed(() => Math.max(0, ...this.items().map((i) => i.value)));

  protected width(v: number): number {
    return this.max() === 0 ? 0 : Math.max(v > 0 ? 2 : 0, (v / this.max()) * 100);
  }
}

/** One stacked bar plus a legend with counts and shares. */
@Component({
  selector: 'app-stack-bar',
  imports: [TranslatePipe],
  template: `
    @if (total() === 0) {
      <div class="text-body-secondary small" role="status">{{ empty() }}</div>
    } @else {
      <div class="progress mb-2" style="block-size: 1.1rem" role="img" [attr.aria-label]="label()">
        @for (it of items(); track it.labelKey ?? it.label) {
          @if (it.value > 0) {
            <div class="progress-bar" [class]="'bg-' + (it.tone ?? 'primary')" [style.inline-size.%]="(it.value / total()) * 100"></div>
          }
        }
      </div>
      <ul class="list-inline small mb-0">
        @for (it of items(); track it.labelKey ?? it.label) {
          <li class="list-inline-item me-3">
            <span class="badge" [class]="'text-bg-' + (it.tone ?? 'primary')">&nbsp;</span>
            {{ it.labelKey ? (it.labelKey | translate) : it.label }}: <strong dir="ltr">{{ it.display ?? it.value }}</strong>
            <span class="text-body-secondary" dir="ltr">({{ share(it.value) }}%)</span>
          </li>
        }
      </ul>
    }
  `,
})
export class StackBar {
  readonly items = input.required<readonly ChartItem[]>();
  readonly label = input('');
  readonly empty = input('');
  protected readonly total = computed(() => this.items().reduce((n, i) => n + i.value, 0));

  protected share(v: number): number {
    return this.total() === 0 ? 0 : Math.round((v / this.total()) * 1000) / 10;
  }
}

/** Columns over time. The values are printed above the columns and repeated in a screen-reader table. */
@Component({
  selector: 'app-column-chart',
  template: `
    @if (items().length === 0 || max() === 0) {
      <div class="text-body-secondary small" role="status">{{ empty() }}</div>
    } @else {
      <svg [attr.viewBox]="'0 0 ' + width() + ' 160'" class="w-100" role="img" [attr.aria-label]="label()" preserveAspectRatio="xMidYMid meet">
        <line x1="0" [attr.x2]="width()" y1="130" y2="130" stroke="currentColor" opacity="0.25" />
        @for (c of cols(); track c.label) {
          <rect [attr.x]="c.x" [attr.y]="c.y" [attr.width]="barW" [attr.height]="c.h" rx="3" [attr.fill]="'var(--bs-' + (c.tone) + ')'" />
          <text [attr.x]="c.x + barW / 2" [attr.y]="c.y - 4" text-anchor="middle" font-size="10" fill="currentColor">{{ c.display }}</text>
          <text [attr.x]="c.x + barW / 2" y="146" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">{{ c.label }}</text>
        }
      </svg>
      <table class="visually-hidden">
        <caption>{{ label() }}</caption>
        <tbody>
          @for (c of items(); track c.label) {
            <tr><th scope="row">{{ c.label }}</th><td>{{ c.display ?? c.value }}</td></tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class ColumnChart {
  readonly items = input.required<readonly ChartItem[]>();
  readonly label = input('');
  readonly empty = input('');
  protected readonly barW = 34;
  private readonly gap = 14;
  protected readonly max = computed(() => Math.max(0, ...this.items().map((i) => i.value)));
  protected readonly width = computed(() => Math.max(1, this.items().length) * (this.barW + this.gap) + this.gap);
  protected readonly cols = computed(() =>
    this.items().map((it, i) => {
      const h = this.max() === 0 ? 0 : Math.max(it.value > 0 ? 2 : 0, (it.value / this.max()) * 100);
      return { label: it.label, display: it.display ?? String(it.value), x: this.gap + i * (this.barW + this.gap), h, y: 130 - h, tone: it.tone ?? 'primary' };
    }),
  );
}

/** A titled card that holds a chart. */
@Component({
  selector: 'app-chart-card',
  template: `
    <section class="card h-100">
      <div class="card-body">
        <h3 class="h6 mb-3">{{ title() }}</h3>
        <ng-content />
      </div>
    </section>
  `,
})
export class ChartCard {
  readonly title = input.required<string>();
}

const PIE_TONES: readonly Tone[] = ['primary', 'success', 'warning', 'danger', 'info', 'secondary'];

/**
 * A donut chart with a legend that repeats every count and share, so no slice depends on colour alone.
 * Slices without a tone take the next colour from a fixed palette.
 */
@Component({
  selector: 'app-pie-chart',
  imports: [TranslatePipe],
  template: `
    @if (total() === 0) {
      <div class="text-body-secondary small" role="status">{{ empty() }}</div>
    } @else {
      <div class="d-flex flex-wrap align-items-center gap-3">
        <svg viewBox="0 0 120 120" width="160" height="160" role="img" [attr.aria-label]="label()" class="flex-shrink-0">
          <circle cx="60" cy="60" [attr.r]="radius" fill="none" stroke="var(--bs-border-color)" stroke-width="22" />
          @for (s of slices(); track s.key) {
            <circle cx="60" cy="60" [attr.r]="radius" fill="none" stroke-width="22" transform="rotate(-90 60 60)"
              [attr.stroke]="'var(--bs-' + s.tone + ')'" [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.offset" />
          }
          <text x="60" y="64" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor">{{ total() }}</text>
        </svg>
        <ul class="list-unstyled small mb-0 flex-grow-1">
          @for (s of slices(); track s.key) {
            <li class="d-flex align-items-center gap-2 mb-1">
              <span class="badge" [class]="'text-bg-' + s.tone">&nbsp;</span>
              <span class="text-truncate">{{ s.labelKey ? (s.labelKey | translate) : s.text }}</span>
              <strong class="ms-auto text-nowrap" dir="ltr">{{ s.display }}</strong>
              <span class="text-body-secondary text-nowrap" dir="ltr">({{ s.share }}%)</span>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class PieChart {
  readonly items = input.required<readonly ChartItem[]>();
  readonly label = input('');
  readonly empty = input('');
  protected readonly radius = 44;
  protected readonly total = computed(() => this.items().reduce((n, i) => n + Math.max(0, i.value), 0));
  protected readonly slices = computed(() => {
    const circumference = 2 * Math.PI * this.radius;
    const total = this.total();
    let used = 0;
    return this.items()
      .filter((it) => it.value > 0)
      .map((it, i) => {
        const len = (it.value / total) * circumference;
        const slice = {
          key: it.labelKey ?? it.label,
          labelKey: it.labelKey,
          text: it.label,
          tone: it.tone ?? PIE_TONES[i % PIE_TONES.length],
          display: it.display ?? String(it.value),
          share: Math.round((it.value / total) * 1000) / 10,
          dash: `${len} ${circumference - len}`,
          offset: -used,
        };
        used += len;
        return slice;
      });
  });
}

/** A line over time that may cross zero: the area below zero is drawn red. Values are printed at the ends and at the lowest point. */
@Component({
  selector: 'app-line-chart',
  template: `
    @if (items().length < 2) {
      <div class="text-body-secondary small" role="status">{{ empty() }}</div>
    } @else {
      <svg viewBox="0 0 640 200" class="w-100" role="img" [attr.aria-label]="label()" preserveAspectRatio="xMidYMid meet">
        <line x1="40" x2="620" [attr.y1]="zeroY()" [attr.y2]="zeroY()" stroke="currentColor" opacity="0.35" stroke-dasharray="4 3" />
        <polyline [attr.points]="points()" fill="none" stroke="var(--bs-primary)" stroke-width="2.5" stroke-linejoin="round" />
        @for (p of dots(); track p.i) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.5" [attr.fill]="p.negative ? 'var(--bs-danger)' : 'var(--bs-primary)'" />
          @if (p.show) {
            <text [attr.x]="p.x" [attr.y]="p.y - 8" text-anchor="middle" font-size="10" fill="currentColor">{{ p.display }}</text>
          }
          @if (p.i % step() === 0) {
            <text [attr.x]="p.x" y="192" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">{{ p.label }}</text>
          }
        }
      </svg>
      <table class="visually-hidden">
        <caption>{{ label() }}</caption>
        <tbody>
          @for (c of items(); track c.label) {
            <tr><th scope="row">{{ c.label }}</th><td>{{ c.display ?? c.value }}</td></tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class LineChart {
  readonly items = input.required<readonly ChartItem[]>();
  readonly label = input('');
  readonly empty = input('');
  private readonly top = 24;
  private readonly bottom = 168;
  private readonly lo = computed(() => Math.min(0, ...this.items().map((i) => i.value)));
  private readonly hi = computed(() => Math.max(0, ...this.items().map((i) => i.value)));
  private readonly y = (v: number): number => {
    const span = this.hi() - this.lo();
    return span === 0 ? this.bottom : this.bottom - ((v - this.lo()) / span) * (this.bottom - this.top);
  };
  protected readonly zeroY = computed(() => this.y(0));
  protected readonly step = computed(() => Math.ceil(this.items().length / 8));
  protected readonly dots = computed(() => {
    const n = this.items().length;
    const lowest = this.items().reduce((m, it, i, a) => (it.value < a[m].value ? i : m), 0);
    return this.items().map((it, i) => ({
      i,
      x: 40 + (n === 1 ? 0 : (i / (n - 1)) * 580),
      y: this.y(it.value),
      label: it.label,
      display: it.display ?? String(it.value),
      negative: it.value < 0,
      show: i === 0 || i === n - 1 || i === lowest,
    }));
  });
  protected readonly points = computed(() => this.dots().map((d) => `${d.x},${d.y}`).join(' '));
}
