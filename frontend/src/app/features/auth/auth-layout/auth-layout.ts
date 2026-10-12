import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageSwitch } from '../../../shared/components/language-switch/language-switch';
import { LoginArt } from '../login/login-art/login-art';

/** Split-pane shell shared by the sign-in and register pages: form content on one side, illustration on the other. */
@Component({
  selector: 'app-auth-layout',
  imports: [TranslatePipe, LanguageSwitch, LoginArt],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {}
