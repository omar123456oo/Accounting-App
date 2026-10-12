import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './header';
import { Sidebar } from './sidebar';

/** Sidebar | (header over content). Plain flex row, so the sidebar lands at inline-start in both directions. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Header, Sidebar],
  styleUrl: './shell.scss',
  template: `
    <div class="shell">
      <app-sidebar class="shell-sidebar" />
      <div class="shell-main">
        <app-header />
        <main class="p-4" id="main-content" tabindex="-1">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Shell {}
