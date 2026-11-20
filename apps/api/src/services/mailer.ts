import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

let transporter: Transporter | null = null;

export const mailer = {
  get enabled(): boolean {
    return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
  },
  init(): void {
    if (!this.enabled) return;
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  },
  async send(to: string, subject: string, text: string): Promise<boolean> {
    if (!transporter) return false;
    try {
      await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text });
      return true;
    } catch (err) {
      console.error('[mail] send failed:', (err as Error).message);
      return false;
    }
  },
};
