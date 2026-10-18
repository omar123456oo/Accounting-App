import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MockBanner } from './shared/components/mock-banner/mock-banner';
import { ToastContainer } from './shared/components/toast/toast-container';

@Component({
  imports: [RouterOutlet, ToastContainer], // MockBanner is not omported by me omar eftekr
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
