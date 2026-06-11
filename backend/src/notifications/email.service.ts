import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async sendReport(to: string[], subject: string, files: string[]) {
    await this.transporter.sendMail({
      from: `"FlowOps" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: 'Please find attached today’s SLA breach report.',
      attachments: files.map(f => ({
        filename: f.split('/').pop(),
        path: f,
      })),
    });
  }
}
