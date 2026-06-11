// @ts-nocheck
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service'; // Ensure path is correct
import * as nodemailer from 'nodemailer';
import { CreateQuoteDto } from './dto/create-quote.dto';

@Injectable()
export class LeadsService {
  private transporter;
  private readonly logger = new Logger('LeadsService');

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    // Configure Transporter using your .env MAIL_ keys
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      secure: false, // Use TLS
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASSWORD'),
      },
    });
  }

  async handleQuoteRequest(createQuoteDto: CreateQuoteDto) {
    const { name, email, origin, destination } = createQuoteDto;

    try {
      // 1. Persist to PostgreSQL via Prisma
      const newLead = await this.prisma.lead.create({
        data: {
          name,
          email,
          origin,
          destination: destination as any,
          status: 'NEW',
        },
      });

      this.logger.log(`💾 Lead saved to DB: ID ${newLead.id}`);

      // 2. Prepare Email
      const fromName = this.configService.get<string>('MAIL_FROM') || 'FlowOps Engine';
      const mailOptions = {
        from: fromName,
        to: this.configService.get<string>('MAIL_USER'), // Notify operations
        subject: `[LEAD #${newLead.id}] New Quote Request: ${name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
            <h2 style="color: #1e40af;">New Lead Captured</h2>
            <p>A new quote request was received and saved to the database.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Collection:</strong> ${origin}</p>
            <p><strong>Delivery:</strong> ${destination}</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 12px; color: #64748b;">FlowOps System ID: ${newLead.id} | ${new Date().toISOString()}</p>
          </div>
        `,
      };

      // 3. Dispatch Email
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`📧 Notification email sent to operations for ${email}`);

      return {
        status: 'success',
        leadId: newLead.id,
        message: 'Quote request processed and saved.',
      };

    } catch (error: unknown) {
      // TypeScript Safe Error Handling
      const errorMessage = error instanceof Error ? error.message : 'Unknown Error';
      this.logger.error(`❌ Lead Processing Failed: ${errorMessage}`);
      
      throw new InternalServerErrorException('System failed to process lead. Please try again.');
    }
  }
}
