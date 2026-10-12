import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MockBanner } from './shared/components/mock-banner/mock-banner';
import { ToastContainer } from './shared/components/toast/toast-container';

@Component({
  imports: [RouterOutlet, MockBanner, ToastContainer],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
