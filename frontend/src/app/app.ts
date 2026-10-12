import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageSwitch } from './shared/components/language-switch/language-switch';

@Component({
  imports: [RouterOutlet, TranslatePipe, LanguageSwitch],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
