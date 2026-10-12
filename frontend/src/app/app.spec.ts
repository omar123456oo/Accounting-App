import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { App } from './app';

describe('App', () => {
  it('renders the routed outlet, the toast area and the mock-mode banner', async () => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([]), provideTranslateService()] });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-toast-container')).toBeTruthy();
    expect(el.querySelector('app-mock-banner [role="status"]')).toBeTruthy();
  });
});
