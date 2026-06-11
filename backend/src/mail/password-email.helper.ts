import sgMail from '@sendgrid/mail';

/**
 * 🔐 Utility to send temporary passwords to new users
 */
export async function sendGeneratedPasswordEmail(
  email: string,
  password: string,
): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.MAIL_FROM || 'no-reply@flowops.co.za';

  if (!apiKey) {
    console.warn(`[MAIL] API Key missing. Password for ${email}: ${password}`);
    return;
  }

  sgMail.setApiKey(apiKey);

  const msg = {
    to: email,
    from: fromEmail,
    subject: 'Your FlowOps Access Credentials',
    text: `Welcome to FlowOps.\n\nYour account is ready.\nTemporary password: ${password}\n\nLink: http://app.flowops.co.za/login`,
    html: `
      <div style="font-family: sans-serif; color: #1e293b;">
        <h2>Welcome to FlowOps</h2>
        <p>Your account has been successfully created by your administrator.</p>
        <div style="background: #f1f5f9; padding: 20px; border-radius: 8px;">
          <strong>Temporary Password:</strong> <code style="color: #38bdf8;">${password}</code>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
          You will be prompted to change this password upon your first login.
        </p>
      </div>
    `,
  };

  await sgMail.send(msg);
}
