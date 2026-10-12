import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Decorative illustration: a balance scale that settles level on load (debits meet credits). */
@Component({
  selector: 'app-login-art',
  imports: [TranslatePipe],
  templateUrl: './login-art.html',
  styleUrl: './login-art.scss',
})
export class LoginArt {}
