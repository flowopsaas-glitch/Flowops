// src/mail/password-email.helper.ts
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function sendPasswordEmail(to: string, tempPassword: string) {
  const msg = {
    to,
    from: process.env.SENDGRID_FROM_EMAIL!,
    subject: 'Your temporary password',
    text: `Your temporary password is ${tempPassword}`,
  };
  await sgMail.send(msg);
}
