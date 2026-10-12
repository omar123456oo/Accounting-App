import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { App } from './app';

describe('App', () => {
  it('renders the language switch', async () => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([]), provideTranslateService()] });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-language-switch button')).toBeTruthy();
  });
});
