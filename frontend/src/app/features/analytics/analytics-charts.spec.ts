import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ChartItem, LineChart, PieChart } from './analytics-charts';

@Component({
  imports: [PieChart, LineChart],
  template: `<app-pie-chart [items]="pie" label="pie" empty="none" /><app-line-chart [items]="line" label="line" empty="none" />`,
})
class Host {
  pie: ChartItem[] = [{ label: 'A', value: 3 }, { label: 'B', value: 1 }, { label: 'Zero', value: 0 }];
  line: ChartItem[] = [{ label: '1', value: 10 }, { label: '2', value: -5 }, { label: '3', value: 7 }];
}

describe('pie and line charts', () => {
  const render = () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  };

  it('draws one slice per positive value and writes the share of each in the legend', () => {
    const el = render();
    const pie = el.querySelector('app-pie-chart')!;
    expect(pie.querySelectorAll('svg circle[stroke-dasharray]').length).toBe(2);
    expect(pie.textContent).toContain('(75%)');
    expect(pie.textContent).toContain('(25%)');
    expect(pie.querySelector('svg text')!.textContent).toBe('4');
  });

  it('draws the line through every point and marks a negative point in the danger colour', () => {
    const el = render();
    const line = el.querySelector('app-line-chart')!;
    expect(line.querySelector('polyline')!.getAttribute('points')!.split(' ').length).toBe(3);
    expect(line.querySelectorAll('circle[fill="var(--bs-danger)"]').length).toBe(1);
  });
});
