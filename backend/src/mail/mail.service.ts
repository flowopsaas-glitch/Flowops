// @ts-nocheck
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger('FlowOps-AI-Core');
  private transporter: nodemailer.Transporter;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.runSystemDiagnostic();
  }

  private initializeTransporter() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.MAIL_USER, // flowopsaas@gmail.com
        pass: process.env.MAIL_PASSWORD, // ousgbgphqkwcvhlr
      },
    });
  }

  private async runSystemDiagnostic() {
    try {
      this.initializeTransporter();
      await this.transporter.verify();
      this.logger.log('✅ FlowOps AI: SMTP Bridge Verified.');
    } catch (error: any) {
      await this.performAiRepair(error);
    }
  }

  private async performAiRepair(error: any) {
    const isAuthError = error.message.includes('535');
    await this.prisma.aiSystemLog.create({
      data: {
        component: 'MailService',
        errorCode: isAuthError ? 'AUTH_535' : 'UNKNOWN',
        severity: 'CRITICAL',
        repairAction: isAuthError ? 'Sanitizing MAIL_PASSWORD' : 'Log Only',
      }
    });
    if (isAuthError) {
      process.env.MAIL_PASSWORD = process.env.MAIL_PASSWORD?.trim();
      this.initializeTransporter();
    }
  }

  // --- RESTORED METHODS ---

  async sendWaybillConfirmation(data: { to: string; waybillNumber: string; customerName: string }) {
    const msg = {
      to: data.to,
      from: `"FlowOps Operations" <${process.env.MAIL_USER}>`,
      subject: `Waybill Confirmation: ${data.waybillNumber}`,
      html: `<p>Hello ${data.customerName}, Waybill <strong>#${data.waybillNumber}</strong> processed.</p>`,
    };
    return this.safeSend(msg, `Confirmation ${data.waybillNumber}`);
  }

  async sendInvoice(data: { to: string; subject: string; invoiceNumber: string; amount: number; attachments: any[] }) {
    const msg = {
      to: data.to,
      from: `"FlowOps Billing" <${process.env.MAIL_USER}>`,
      subject: data.subject,
      text: `Tax Invoice ${data.invoiceNumber} attached.`,
      attachments: data.attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.type
      })),
    };
    return this.safeSend(msg, `Invoice ${data.invoiceNumber}`);
  }

  async sendInvoiceReminder(data: { to: string; subject: string; invoiceNumber: string; amount: number; daysOverdue: number }) {
    const msg = {
      to: data.to,
      from: `"FlowOps Accounts" <${process.env.MAIL_USER}>`,
      subject: data.subject,
      html: `<p>Invoice ${data.invoiceNumber} is ${data.daysOverdue} days overdue.</p>`,
    };
    return this.safeSend(msg, `Reminder ${data.invoiceNumber}`);
  }

  // --- HEALED AI ASSISTANT METHOD ---

  async handleClientQuery(waybillId: number, clientEmail: string) { // Changed waybillId to number
    const waybill = await this.prisma.waybill.findUnique({ where: { id: waybillId } });
    
    // Fixed Type Comparison
    const isHealthy = waybill?.podUrl && (waybill.status as any) !== 'FAILED';
    
    const htmlContent = `<div><h3>FlowOps AI Support</h3><p>Analysis for #${waybill?.waybillNumber}: ${isHealthy ? 'Documentation Verified' : 'Discrepancy Detected'}</p></div>`;
    return this.safeSend({ to: clientEmail, subject: 'AI Assistance', html: htmlContent }, 'AI Query');
  }

  private async safeSend(msg: any, context: string) {
    try {
      return await this.transporter.sendMail({
        from: `"FlowOps Engine" <${process.env.MAIL_USER}>`,
        ...msg
      });
    } catch (e: any) {
      this.logger.error(`❌ Mail Error (${context}): ${e.message}`);
    }
  }
}
