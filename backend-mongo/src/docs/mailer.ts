import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

export interface MailInput { to: string; subject: string; text: string; html?: string }
export interface MailResult { ok: boolean; messageId?: string; error?: string }
export interface Mailer { send(m: MailInput): Promise<MailResult> }

class SmtpMailer implements Mailer {
  private t?: Transporter;
  private transport(): Transporter {
    return (this.t ??= nodemailer.createTransport({ host: env.mail.host, port: env.mail.port, secure: env.mail.secure, ...(env.mail.user ? { auth: { user: env.mail.user, pass: env.mail.pass } } : {}), connectionTimeout: 10_000, socketTimeout: 20_000 }));
  }
  /** `ok` means the SMTP server accepted the message for this address. It does not mean the person has received or read it. */
  async send(m: MailInput): Promise<MailResult> {
    try {
      const info = await this.transport().sendMail({ from: env.mail.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
      const accepted = ((info.accepted ?? []) as unknown[]).map((a) => String(a).toLowerCase());
      if (!accepted.includes(m.to.toLowerCase())) return { ok: false, error: 'The mail server did not accept the address.' };
      return { ok: true, messageId: info.messageId };
    } catch (e) {
      return { ok: false, error: `Mail could not be sent: ${(e as { code?: string }).code ?? (e as Error).message}`.slice(0, 300) };
    }
  }
}

let override: Mailer | null | undefined;
/** Tests inject a mailer; `null` forces "not configured". */
export const setMailer = (m: Mailer | null | undefined): void => { override = m; };
export const mailer = (): Mailer | null => (override !== undefined ? override : env.mail.host ? new SmtpMailer() : null);
export const mailState = () => ({ configured: mailer() !== null, host: env.mail.host || null });

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
