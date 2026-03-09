/**
 * EmailService – non-critical side effect pattern.
 * EMAIL_MODE=mock (default) → logs to console / file
 * EMAIL_MODE=smtp           → sends via nodemailer
 *
 * CRITICAL: Email failures NEVER block request handling.
 * All send calls MUST be wrapped in try/catch at the call site.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class EmailService {
  constructor() {
    this.mode      = process.env.EMAIL_MODE || 'mock';
    this.adminEmail = process.env.ADMIN_EMAIL || 'admin@nicoletcz.cz';
    this.fromEmail  = process.env.EMAIL_FROM  || 'noreply@nicoletcz.cz';

    if (this.mode === 'smtp') {
      console.log('📧 EmailService: SMTP mode');
    } else {
      console.log('📧 EmailService: MOCK mode (emails logged to console/file)');
    }
  }

  /** Parse comma-separated emails, return joined string or null. */
  _resolveRecipients(raw) {
    if (!raw) return null;
    const valid = String(raw).split(',')
      .map(e => e.trim())
      .filter(e => e && e.includes('@'));
    return valid.length ? valid.join(', ') : null;
  }

  /**
   * Send form submission notification to configured email_recipients.
   * NON-CRITICAL – call site must wrap in try/catch.
   */
  async sendFormNotification(formName, fields, recipients) {
    const to = this._resolveRecipients(recipients || this.adminEmail);
    if (!to) {
      console.log('📧 Form notification skipped – no recipient configured');
      return;
    }

    const fieldLines = Object.entries(fields)
      .filter(([k]) => k !== 'website' && k !== 'form_loaded_at') // skip honeypot + timing
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    const subject = `Nový formulář: ${formName}`;
    const text = [
      `Nový formulář ze stránek Nicolet CZ`,
      `Formulář: ${formName}`,
      ``,
      fieldLines,
      ``,
      `Čas: ${new Date().toLocaleString('cs-CZ')}`
    ].join('\n');

    await this._send({ to, subject, text, eventType: 'form_notification' });
  }

  /**
   * Send a test email to verify email configuration.
   * NON-CRITICAL – call site must wrap in try/catch.
   */
  async sendTestNotification(toEmail) {
    const to = this._resolveRecipients(toEmail);
    if (!to) throw new Error('Žádný platný email');

    const subject = `Testovací email – Nicolet CZ Admin`;
    const text = [
      `Testovací email z administrace Nicolet CZ.`,
      ``,
      `Pokud jste tento email obdrželi, emailové notifikace fungují správně.`,
      ``,
      `Čas odeslání: ${new Date().toLocaleString('cs-CZ')}`
    ].join('\n');

    await this._send({ to, subject, text, eventType: 'test_notification' });
  }

  async _send({ to, subject, text, eventType }) {
    if (this.mode === 'smtp') {
      try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.default.createTransport({
          host:   process.env.SMTP_HOST,
          port:   Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        await transporter.sendMail({ from: this.fromEmail, to, subject, text });
        console.log(`✅ Email sent: ${eventType} → ${to}`);
      } catch (err) {
        console.error(`❌ Email failed (non-critical): ${eventType}`, err.message);
      }
    } else {
      // Mock: log + write to file
      console.log(`📧 MOCK EMAIL [${eventType}] To: ${to} | Subject: ${subject}`);
      try {
        const logDir = path.join(__dirname, '../logs/emails');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const filename = `${Date.now()}-${eventType}.json`;
        fs.writeFileSync(
          path.join(logDir, filename),
          JSON.stringify({ to, subject, text, eventType, timestamp: new Date().toISOString() }, null, 2)
        );
      } catch {
        // file logging failure is non-critical
      }
    }
  }
}

export default new EmailService();
