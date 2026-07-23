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

  // ── Trial lifecycle emails (tenant-facing) ──────────────────────────────

  /** Sent to tenant admin when their company first starts the 14-day trial. */
  async sendTrialStartedEmail(
    email: string,
    tenant: { name: string; companyName: string; trialEndsAt: Date },
  ): Promise<boolean> {
    const billingUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/settings/billing`;
    const endDate = new Date(tenant.trialEndsAt).toLocaleDateString('en-ZA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    return this.send({
      to: email,
      subject: `Your 14-day free trial has started — ${tenant.companyName}`,
      text: `Hi ${tenant.name},\n\nYour FlowOps 14-day free trial is active! You have full Professional access until ${endDate}.\n\nUpgrade anytime at: ${billingUrl}`,
      html: this.wrap(`
        <h2 style="margin-top:0;color:#1e3a5f;">Your free trial is live!</h2>
        <p>Hi ${tenant.name},</p>
        <p>Welcome to <strong>FlowOps</strong>! Your <strong>${tenant.companyName}</strong> workspace now has
        full <strong>Professional-tier access</strong> for 14 days — completely free.</p>

        <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;font-weight:700;color:#166534;">What you get during your trial:</p>
          <ul style="margin:8px 0 0;padding-left:20px;color:#374151;">
            <li>Unlimited waybills & shipments</li>
            <li>Unlimited drivers & team members</li>
            <li>WhatsApp notifications & live tracking</li>
            <li>AI-powered route optimization</li>
            <li>Full analytics & reporting</li>
            <li>Real-time driver GPS tracking</li>
          </ul>
        </div>

        <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:16px 20px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;">
            <strong>Trial ends:</strong> ${endDate}<br/>
            <span style="color:#6b7280;font-size:13px;">After your trial, you'll need to upgrade to Professional or Enterprise to continue.</span>
          </p>
        </div>

        <a href="${billingUrl}" class="btn" style="background:#22c55e;">Start exploring FlowOps</a>
        <p style="color:#94a3b8;font-size:13px;">
          Questions? Reply to this email — we're here to help you succeed.
        </p>
      `),
    });
  }

  /** Sent to tenant admin X days before trial expires (7, 3, 1 days). */
  async sendTrialExpiryWarningEmail(
    email: string,
    tenant: { name: string; companyName: string; daysLeft: number; trialEndsAt: Date },
  ): Promise<boolean> {
    const billingUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/settings/billing`;
    const endDate = new Date(tenant.trialEndsAt).toLocaleDateString('en-ZA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const urgency = tenant.daysLeft === 1 ? 'FINAL DAY' : tenant.daysLeft === 3 ? 'Almost over' : 'Ending soon';
    const urgencyColor = tenant.daysLeft === 1 ? '#dc2626' : tenant.daysLeft === 3 ? '#f59e0b' : '#3b82f6';

    return this.send({
      to: email,
      subject: `${urgency}: Your FlowOps trial expires ${tenant.daysLeft === 1 ? 'TOMORROW' : `in ${tenant.daysLeft} days`} — ${tenant.companyName}`,
      text: `Hi ${tenant.name},\n\nYour FlowOps trial expires in ${tenant.daysLeft} day(s) on ${endDate}.\n\nUpgrade now to keep your data and access: ${billingUrl}\n\nAfter expiry, your account will be locked until you choose a plan.`,
      html: this.wrap(`
        <h2 style="margin-top:0;color:${urgencyColor};">
          ${tenant.daysLeft === 1 ? 'FINAL DAY' : `${tenant.daysLeft} days left`} on your trial
        </h2>
        <p>Hi ${tenant.name},</p>
        <p>Your <strong>${tenant.companyName}</strong> free trial ${tenant.daysLeft === 1 ? 'expires <strong>tomorrow</strong>' : `ends in <strong>${tenant.daysLeft} days</strong>`} on <strong>${endDate}</strong>.</p>

        <div style="background:#fef2f2;border-left:4px solid ${urgencyColor};padding:16px 20px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;font-weight:700;color:#991b1b;">What happens when your trial ends:</p>
          <ul style="margin:8px 0 0;padding-left:20px;color:#374151;">
            <li>Your account will be <strong>locked</strong></li>
            <li>You won't be able to create waybills, track shipments, or manage drivers</li>
            <li>Your data is safe — it's preserved when you upgrade</li>
            <li>Upgrade anytime to instantly restore full access</li>
          </ul>
        </div>

        <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;font-weight:700;color:#166534;">Choose your plan:</p>
          <table style="width:100%;margin:12px 0 0;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;"><strong>Professional</strong></td>
              <td style="padding:8px 0;text-align:right;color:#1e3a5f;font-weight:700;">Custom pricing</td>
            </tr>
            <tr style="border-top:1px solid #e5e7eb;">
              <td style="padding:8px 0;"><strong>Enterprise</strong></td>
              <td style="padding:8px 0;text-align:right;color:#1e3a5f;font-weight:700;">Custom pricing</td>
            </tr>
          </table>
        </div>

        <a href="${billingUrl}" class="btn" style="background:${urgencyColor};">
          ${tenant.daysLeft === 1 ? 'Upgrade NOW — last chance' : 'Upgrade to keep your access'}
        </a>
        <p style="color:#94a3b8;font-size:13px;">
          Need help choosing? Reply to this email and we'll get back to you within an hour.
        </p>
      `),
    });
  }

  /** Sent to tenant admin when trial has officially expired and account is locked. */
  async sendTrialExpiredEmail(
    email: string,
    tenant: { name: string; companyName: string },
  ): Promise<boolean> {
    const billingUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/settings/billing`;
    return this.send({
      to: email,
      subject: `Your FlowOps trial has ended — upgrade to continue (${tenant.companyName})`,
      text: `Hi ${tenant.name},\n\nYour 14-day FlowOps trial has ended and your ${tenant.companyName} account is now locked.\n\nAll your data is safe. Upgrade to Professional or Enterprise to instantly restore access.\n\nUpgrade: ${billingUrl}`,
      html: this.wrap(`
        <h2 style="margin-top:0;color:#dc2626;">Your trial has ended</h2>
        <p>Hi ${tenant.name},</p>
        <p>Your 14-day free trial for <strong>${tenant.companyName}</strong> has expired.
        Your account is now <strong>locked</strong> — but don't worry, all your data is safe and waiting for you.</p>

        <div style="background:#fef2f2;border:2px solid #fecaca;padding:20px 24px;border-radius:12px;margin:24px 0;text-align:center;">
          <p style="margin:0 0 4px;font-size:14px;color:#991b1b;font-weight:700;">ACCOUNT STATUS</p>
          <p style="margin:0;font-size:24px;font-weight:800;color:#dc2626;">LOCKED</p>
          <p style="margin:8px 0 0;color:#6b7280;font-size:13px;">Upgrade to restore access instantly</p>
        </div>

        <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;border-radius:8px;margin:20px 0;">
          <p style="margin:0 0 8px;font-weight:700;color:#166534;">What's included when you upgrade:</p>
          <ul style="margin:0;padding-left:20px;color:#374151;">
            <li>All your waybills, drivers & data restored instantly</li>
            <li>Unlimited operations — no caps on waybills or drivers</li>
            <li>WhatsApp notifications & real-time tracking</li>
            <li>AI route optimization & fleet intelligence</li>
            <li>Priority support with dedicated onboarding</li>
          </ul>
        </div>

        <div style="background:#eff6ff;border-radius:12px;padding:20px 24px;margin:20px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #dbeafe;">
                <strong style="font-size:16px;">Professional</strong><br/>
                <span style="color:#6b7280;font-size:13px;">Everything you need to scale</span>
              </td>
              <td style="padding:12px 0;text-align:right;border-bottom:1px solid #dbeafe;">
                <strong style="font-size:18px;color:#1e3a5f;">Custom</strong><span style="color:#6b7280;"> pricing</span>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;">
                <strong style="font-size:16px;">Enterprise</strong><br/>
                <span style="color:#6b7280;font-size:13px;">Custom-built for large operations</span>
              </td>
              <td style="padding:12px 0;text-align:right;">
                <strong style="font-size:18px;color:#1e3a5f;">Custom</strong><span style="color:#6b7280;"> pricing</span>
              </td>
            </tr>
          </table>
        </div>

        <div style="text-align:center;">
          <a href="${billingUrl}" class="btn" style="background:#dc2626;font-size:17px;padding:16px 40px;">
            Upgrade Now — Restore Access
          </a>
        </div>

        <p style="color:#6b7280;font-size:13px;margin-top:24px;">
          <strong>Your data is preserved.</strong> When you upgrade, everything picks up right where you left off —
          waybills, drivers, clients, invoices. Nothing is deleted.
        </p>
        <p style="color:#94a3b8;font-size:13px;">
          Questions about pricing? Need an Enterprise quote? Reply to this email and our team will respond within an hour.
        </p>
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
