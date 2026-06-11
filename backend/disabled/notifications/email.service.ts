import * as nodemailer from 'nodemailer';

export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.example.com',
      port: 587,
      auth: { user: 'user@example.com', pass: 'password' },
    });
  }

  async sendMail(to: string, subject: string, text: string) {
    return this.transporter.sendMail({ from: 'no-reply@example.com', to, subject, text });
  }
}
