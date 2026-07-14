import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface EmailAttachmentInput {
  /** base64-encoded file content */
  content: string;
  filename: string;
  /** MIME type, e.g. application/pdf */
  type?: string;
  disposition?: 'attachment' | 'inline';
  contentId?: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachmentInput[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: 'resend' | 'sendgrid';
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private config: ConfigService) {
    // Resend takes priority over SendGrid when both are configured.
    const resendKey = config.get<string>('RESEND_API_KEY', '');
    const sendgridKey = config.get<string>('SENDGRID_API_KEY', '');

    if (resendKey && resendKey !== 'CHANGE_ME') {
      this.provider = 'resend';
      this.apiKey = resendKey;
    } else {
      this.provider = 'sendgrid';
      this.apiKey = sendgridKey;
    }

    this.fromEmail = config.get<string>('EMAIL_FROM', '') ||
      config.get<string>('RESEND_FROM_EMAIL', '') ||
      config.get<string>('SENDGRID_FROM_EMAIL', 'noreply@flowops.local');
    this.fromName = config.get<string>('EMAIL_FROM_NAME', '') ||
      config.get<string>('RESEND_FROM_NAME', '') ||
      config.get<string>('SENDGRID_FROM_NAME', 'FlowOps');
  }

  get isConfigured(): boolean {
    if (this.provider === 'resend') return Boolean(this.apiKey);
    return Boolean(this.apiKey && this.apiKey !== 'SG.CHANGE_ME');
  }

  async send(params: SendEmailParams): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn(
        `[EMAIL NOT SENT — ${this.provider} not configured]\n` +
        `To: ${params.to}\nSubject: ${params.subject}\n` +
        `Body preview: ${params.text ?? params.html.replace(/<[^>]+>/g, '').slice(0, 200)}`,
      );
      return false;
    }

    try {
      if (this.provider === 'resend') {
        return await this.sendViaResend(params);
      } else {
        return await this.sendViaSendGrid(params);
      }
    } catch (err: any) {
      const detail = err?.response?.data?.message ?? err?.response?.data?.errors?.[0]?.message ?? err.message;
      this.logger.error(`Email failed → ${params.to}: ${detail}`);
      return false;
    }
  }

  private async sendViaResend(params: SendEmailParams): Promise<boolean> {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        ...(params.text ? { text: params.text } : {}),
        ...(params.attachments?.length
          ? {
              attachments: params.attachments.map((a) => ({
                content: a.content,
                filename: a.filename,
              })),
            }
          : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    this.logger.log(`Email sent (Resend) → ${params.to}: ${params.subject}`);
    return true;
  }

  private async sendViaSendGrid(params: SendEmailParams): Promise<boolean> {
    await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      {
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: this.fromEmail, name: this.fromName },
        subject: params.subject,
        content: [
          ...(params.text ? [{ type: 'text/plain', value: params.text }] : []),
          { type: 'text/html', value: params.html },
        ],
        ...(params.attachments?.length
          ? {
              attachments: params.attachments.map((a) => ({
                content: a.content,
                filename: a.filename,
                type: a.type || 'application/octet-stream',
                disposition: a.disposition || 'attachment',
                ...(a.contentId ? { content_id: a.contentId } : {}),
              })),
            }
          : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    this.logger.log(`Email sent (SendGrid) → ${params.to}: ${params.subject}`);
    return true;
  }

  // ── Branded templates ──────────────────────────────────────────────────

  private wrap(body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f1f5f9; margin: 0; padding: 0; }
    .card { max-width: 520px; margin: 40px auto; background: #ffffff;
            border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #0d2a63 100%);
              padding: 32px 40px; color: #fff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -.5px; }
    .body { padding: 36px 40px; color: #374151; line-height: 1.6; }
    .btn { display: inline-block; margin: 24px 0; background: #3b82f6;
           color: #fff !important; text-decoration: none; padding: 14px 32px;
           border-radius: 10px; font-weight: 700; font-size: 15px; }
    .footer { background: #f8fafc; padding: 20px 40px; font-size: 12px;
              color: #94a3b8; border-top: 1px solid #e2e8f0; }
    code { background: #f1f5f9; border-radius: 6px; padding: 2px 8px;
           font-size: 18px; letter-spacing: 4px; font-weight: 700; color: #1e3a5f; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><h1>FlowOps</h1></div>
    <div class="body">${body}</div>
    <div class="footer">
      FlowOps · Logistics operations platform<br/>
      This email was sent to you because you have an account on FlowOps.
    </div>
  </div>
</body>
</html>`;
  }

  async sendVerificationEmail(email: string, token: string, name: string): Promise<boolean> {
    const verifyUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/verify-email?token=${token}`;
    return this.send({
      to: email,
      subject: 'Verify your FlowOps email address',
      text: `Hi ${name},\n\nVerify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
      html: this.wrap(`
        <h2 style="margin-top:0;color:#1e3a5f;">Welcome to FlowOps, ${name}!</h2>
        <p>Please verify your email address to activate your account.</p>
        <a href="${verifyUrl}" class="btn">Verify email address</a>
        <p style="color:#94a3b8;font-size:13px;">
          This link expires in <strong>24 hours</strong>.<br/>
          If you didn't create a FlowOps account, you can safely ignore this email.
        </p>
      `),
    });
  }

  async sendPasswordResetEmail(email: string, token: string, name: string): Promise<boolean> {
    const resetUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/reset-password?token=${token}`;
    return this.send({
      to: email,
      subject: 'Reset your FlowOps password',
      text: `Hi ${name},\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
      html: this.wrap(`
        <h2 style="margin-top:0;color:#1e3a5f;">Password reset request</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your FlowOps password. Click the button below to set a new one.</p>
        <a href="${resetUrl}" class="btn">Reset password</a>
        <p style="color:#94a3b8;font-size:13px;">
          This link expires in <strong>1 hour</strong>.<br/>
          If you didn't request a password reset, you can safely ignore this email.
          Your password won't change until you click the link above and create a new one.
        </p>
      `),
    });
  }

  async sendWelcomeEmail(email: string, name: string, companyName: string): Promise<boolean> {
    const loginUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/login`;
    return this.send({
      to: email,
      subject: `Welcome to FlowOps — your ${companyName} workspace is ready`,
      text: `Hi ${name},\n\nYour FlowOps account is approved and ready. Sign in at: ${loginUrl}`,
      html: this.wrap(`
        <h2 style="margin-top:0;color:#1e3a5f;">Your workspace is ready, ${name}!</h2>
        <p>Your <strong>${companyName}</strong> FlowOps account has been approved.</p>
        <p>You can now sign in and start managing your courier operations.</p>
        <a href="${loginUrl}" class="btn">Sign in to FlowOps</a>
      `),
    });
  }

  async sendApprovalRequestNotification(
    ownerEmail: string,
    applicant: { name: string; email: string; company: string },
  ): Promise<boolean> {
    const dashboardUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/owner/tenants`;
    return this.send({
      to: ownerEmail,
      subject: `New FlowOps access request — ${applicant.company}`,
      text: `New request from ${applicant.name} (${applicant.email}) at ${applicant.company}. Review: ${dashboardUrl}`,
      html: this.wrap(`
        <h2 style="margin-top:0;color:#1e3a5f;">New access request</h2>
        <p>A new company has requested access to FlowOps:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="color:#6b7280;padding:6px 0;width:120px;">Name</td><td><strong>${applicant.name}</strong></td></tr>
          <tr><td style="color:#6b7280;padding:6px 0;">Email</td><td>${applicant.email}</td></tr>
          <tr><td style="color:#6b7280;padding:6px 0;">Company</td><td><strong>${applicant.company}</strong></td></tr>
        </table>
        <a href="${dashboardUrl}" class="btn">Review in dashboard</a>
      `),
    });
  }

  /** Generic platform-owner alert (churn, SLA spike, payment failure, etc.). */
  async sendOwnerAlert(
    ownerEmail: string,
    alert: { title: string; message: string; severity?: string; tenantName?: string | null },
  ): Promise<boolean> {
    const dashboardUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/owner/dashboard`;
    const sev = (alert.severity || 'warning').toUpperCase();
    return this.send({
      to: ownerEmail,
      subject: `[FlowOps ${sev}] ${alert.title}`,
      text: `${alert.title}\n\n${alert.message}\n\nReview: ${dashboardUrl}`,
      html: this.wrap(`
        <h2 style="margin-top:0;color:#1e3a5f;">${alert.title}</h2>
        ${alert.tenantName ? `<p style="color:#6b7280;margin:0 0 8px;">Tenant: <strong>${alert.tenantName}</strong></p>` : ''}
        <p>${alert.message}</p>
        <a href="${dashboardUrl}" class="btn">Open Owner Console</a>
      `),
    });
  }
}
