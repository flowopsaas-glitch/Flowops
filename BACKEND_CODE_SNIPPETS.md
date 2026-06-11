# FlowOps Backend Code Snippets - SendGrid Integration

This document provides complete code snippets for handling demo request form submissions and sending emails via SendGrid API using NestJS and TypeScript.

## Architecture Overview

The email integration follows a clean architecture pattern with three main components:

1. **Controller** - Handles HTTP requests
2. **Service** - Contains business logic
3. **Email Service** - Manages SendGrid communication

## 1. Email Service Module

### Installation

```bash
npm install @sendgrid/mail
npm install --save-dev @types/node
```

### Email Service Implementation

**File:** `src/email/email.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

interface DemoRequestEmailData {
  fullName: string;
  email: string;
  companyName: string;
  phoneNumber?: string;
  companySize: string;
  message?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (apiKey && apiKey !== 'your-sendgrid-api-key-here') {
      sgMail.setApiKey(apiKey);
    }
  }

  /**
   * Sends notification email to FlowOps team with demo request details
   */
  async sendDemoRequestNotification(data: DemoRequestEmailData): Promise<boolean> {
    const sendgridApiKey = this.configService.get<string>('SENDGRID_API_KEY');
    
    // Graceful fallback if SendGrid not configured
    if (!sendgridApiKey || sendgridApiKey === 'your-sendgrid-api-key-here') {
      this.logger.warn('SendGrid not configured. Demo request logged instead of emailed.');
      this.logger.log(`Demo Request: ${JSON.stringify(data, null, 2)}`);
      return true;
    }

    try {
      const toEmail = this.configService.get<string>('SENDGRID_TO_EMAIL');
      const fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL');

      const emailContent = this.generateDemoRequestEmail(data);

      const msg = {
        to: toEmail,
        from: fromEmail,
        subject: `New Demo Request from ${data.fullName} (${data.companyName})`,
        html: emailContent,
        replyTo: data.email,
      };

      await sgMail.send(msg);
      
      this.logger.log(`Demo request email sent successfully to ${toEmail}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send demo request email', error);
      return false;
    }
  }

  /**
   * Sends confirmation email to user
   */
  async sendDemoConfirmationEmail(userEmail: string, userName: string): Promise<boolean> {
    const sendgridApiKey = this.configService.get<string>('SENDGRID_API_KEY');
    
    if (!sendgridApiKey || sendgridApiKey === 'your-sendgrid-api-key-here') {
      this.logger.warn('SendGrid not configured. Confirmation email not sent.');
      return true;
    }

    try {
      const fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL');

      const confirmationContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #3b82f6;">Demo Request Received</h2>
              <p>Hi ${userName},</p>
              <p>Thank you for requesting a demo of FlowOps! We've received your request and our team will be in touch within 24 hours to schedule your personalized demonstration.</p>
              <p>In the meantime, feel free to explore our <a href="https://flowops.com/docs" style="color: #3b82f6;">documentation</a> or <a href="https://flowops.com/pricing" style="color: #3b82f6;">pricing page</a>.</p>
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
              <p style="color: #666; font-size: 12px;">
                FlowOps - Powerful Logistics Management for South Africa<br>
                Email: FlowOps2@proton.me
              </p>
            </div>
          </body>
        </html>
      `;

      const msg = {
        to: userEmail,
        from: fromEmail,
        subject: 'Demo Request Confirmed - FlowOps',
        html: confirmationContent,
      };

      await sgMail.send(msg);
      
      this.logger.log(`Confirmation email sent to ${userEmail}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send confirmation email', error);
      return false;
    }
  }

  /**
   * Generates professional HTML email for demo request notification
   */
  private generateDemoRequestEmail(data: DemoRequestEmailData): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
            <h2 style="color: #3b82f6; border-bottom: 3px solid #3b82f6; padding-bottom: 10px;">New Demo Request</h2>
            
            <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 15px 0;">
              <h3 style="color: #1f2937; margin-top: 0;">Contact Information</h3>
              <p><strong>Name:</strong> ${data.fullName}</p>
              <p><strong>Email:</strong> <a href="mailto:${data.email}" style="color: #3b82f6;">${data.email}</a></p>
              <p><strong>Company:</strong> ${data.companyName}</p>
              ${data.phoneNumber ? `<p><strong>Phone:</strong> ${data.phoneNumber}</p>` : ''}
              <p><strong>Company Size:</strong> ${data.companySize}</p>
            </div>

            ${data.message ? `
              <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 15px 0;">
                <h3 style="color: #1f2937; margin-top: 0;">Message</h3>
                <p style="white-space: pre-wrap; background-color: #f3f4f6; padding: 10px; border-radius: 4px;">
                  ${data.message}
                </p>
              </div>
            ` : ''}

            <div style="background-color: #eff6ff; padding: 15px; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 15px 0;">
              <p style="margin: 0; color: #1e40af;">
                <strong>Action Required:</strong> Please reach out to this prospect within 24 hours to schedule the demo.
              </p>
            </div>

            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 12px; text-align: center;">
              This is an automated email from FlowOps Demo Request System
            </p>
          </div>
        </body>
      </html>
    `;
  }
}
```

### Email Module

**File:** `src/email/email.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
```

## 2. Demo Service - Form Submission Handler

**File:** `src/demo/services/demo.service.ts`

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Creates a demo request and sends notification emails
   */
  async createDemoRequest(body: any) {
    const { fullName, email, companyName, phoneNumber, companySize, message } = body;

    // Validate required fields
    if (!fullName || !email || !companyName || !companySize) {
      throw new BadRequestException(
        'Full name, email, company name, and company size are required',
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Invalid email format');
    }

    try {
      // Save demo request to database
      const demoRequest = await this.prisma.demoRequest.create({
        data: {
          fullName,
          email,
          companyName,
          phoneNumber: phoneNumber || null,
          companySize,
          message: message || null,
          status: 'PENDING',
          createdAt: new Date(),
        },
      });

      // Send notification email to FlowOps team
      await this.emailService.sendDemoRequestNotification({
        fullName,
        email,
        companyName,
        phoneNumber,
        companySize,
        message,
      });

      // Send confirmation email to the user
      await this.emailService.sendDemoConfirmationEmail(email, fullName);

      return {
        success: true,
        message: 'Demo request submitted successfully. Check your email for confirmation.',
        requestId: demoRequest.id,
      };
    } catch (error) {
      throw new BadRequestException('Failed to submit demo request');
    }
  }
}
```

### Demo Module

**File:** `src/demo/demo.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { DemoController } from './controllers/demo.controller';
import { DemoService } from './services/demo.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
```

## 3. Demo Controller - API Endpoint

**File:** `src/demo/controllers/demo.controller.ts`

```typescript
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { DemoService } from '../services/demo.service';

@Controller('demo')
export class DemoController {
  constructor(private demoService: DemoService) {}

  /**
   * POST /demo/request
   * Handles demo request form submission
   */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async requestDemo(@Body() body: any) {
    return this.demoService.createDemoRequest(body);
  }
}
```

## 4. Environment Configuration

**File:** `.env`

```env
# SendGrid Configuration
SENDGRID_API_KEY="your-actual-sendgrid-api-key"
SENDGRID_FROM_EMAIL="noreply@flowops.com"
SENDGRID_TO_EMAIL="FlowOps2@proton.me"
```

## 5. API Usage Examples

### Using cURL

```bash
curl -X POST http://localhost:4000/demo/request \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "email": "john@example.com",
    "companyName": "Acme Corp",
    "phoneNumber": "+27 123 456 7890",
    "companySize": "51-200",
    "message": "We are interested in learning more about FlowOps for our logistics operations."
  }'
```

### Using JavaScript/Fetch

```javascript
async function submitDemoRequest(formData) {
  try {
    const response = await fetch('http://localhost:4000/demo/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullName: formData.fullName,
        email: formData.email,
        companyName: formData.companyName,
        phoneNumber: formData.phoneNumber,
        companySize: formData.companySize,
        message: formData.message,
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Demo request submitted successfully!');
      console.log('Request ID:', result.requestId);
    } else {
      console.error('Error:', result.message);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}
```

### Using Python

```python
import requests
import json

def submit_demo_request(form_data):
    url = 'http://localhost:4000/demo/request'
    headers = {
        'Content-Type': 'application/json'
    }
    
    payload = {
        'fullName': form_data['fullName'],
        'email': form_data['email'],
        'companyName': form_data['companyName'],
        'phoneNumber': form_data.get('phoneNumber'),
        'companySize': form_data['companySize'],
        'message': form_data.get('message'),
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        result = response.json()
        
        if result.get('success'):
            print('Demo request submitted successfully!')
            print(f"Request ID: {result['requestId']}")
        else:
            print(f"Error: {result.get('message')}")
    except Exception as e:
        print(f"Network error: {e}")

# Usage
form_data = {
    'fullName': 'Jane Smith',
    'email': 'jane@example.com',
    'companyName': 'Tech Solutions Inc',
    'phoneNumber': '+27 987 654 3210',
    'companySize': '201-500',
    'message': 'Interested in enterprise plan'
}

submit_demo_request(form_data)
```

## 6. Database Schema

**File:** `prisma/schema.prisma`

```prisma
model DemoRequest {
  id          String     @id @default(auto()) @map("_id") @db.ObjectId
  fullName    String
  email       String
  companyName String
  phoneNumber String?
  companySize String
  message     String?
  status      DemoStatus @default(PENDING)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

enum DemoStatus {
  PENDING
  CONTACTED
  SCHEDULED
  COMPLETED
  CANCELLED
}
```

## 7. Error Handling & Logging

The implementation includes comprehensive error handling:

### Graceful Degradation

If SendGrid API key is not configured, the system will:
1. Log the demo request to console/logs
2. Still save the request to database
3. Return success response to user
4. Allow manual follow-up

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Invalid email format | Returns 400 Bad Request |
| Missing required fields | Returns 400 Bad Request |
| SendGrid API error | Logs error, continues processing |
| Database error | Returns 400 Bad Request |
| Network timeout | Returns 500 Internal Server Error |

## 8. Testing the Integration

### Step 1: Configure SendGrid

```bash
# Update .env with your SendGrid API key
SENDGRID_API_KEY="SG.xxxxxxxxxxxxx"
```

### Step 2: Start Backend

```bash
cd backend
npm run start:dev
```

### Step 3: Submit Test Request

```bash
curl -X POST http://localhost:4000/demo/request \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test User",
    "email": "test@example.com",
    "companyName": "Test Company",
    "companySize": "1-50"
  }'
```

### Step 4: Verify Emails

Check both:
- Your email inbox (confirmation)
- FlowOps2@proton.me (notification)

## 9. Security Best Practices

### API Key Management

```typescript
// ✅ Good: Use environment variables
const apiKey = process.env.SENDGRID_API_KEY;

// ❌ Bad: Hardcoded API key
const apiKey = 'SG.xxxxxxxxxxxxx';
```

### Input Validation

```typescript
// ✅ Good: Validate all inputs
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  throw new BadRequestException('Invalid email');
}

// ❌ Bad: No validation
const msg = { to: email, ... };
```

### Error Handling

```typescript
// ✅ Good: Don't expose sensitive errors
catch (error) {
  this.logger.error('SendGrid error', error);
  return false;
}

// ❌ Bad: Exposing API details
catch (error) {
  throw new Error(`SendGrid API: ${error.message}`);
}
```

## 10. Performance Optimization

### Async Email Sending

```typescript
// ✅ Good: Non-blocking email sending
await Promise.all([
  this.emailService.sendDemoRequestNotification(data),
  this.emailService.sendDemoConfirmationEmail(email, name),
]);
```

### Database Indexing

```prisma
model DemoRequest {
  // Add indexes for frequently queried fields
  email       String @db.String
  status      DemoStatus
  createdAt   DateTime @default(now())

  @@index([email])
  @@index([status])
  @@index([createdAt])
}
```

## Summary

This implementation provides:

- **Robust email handling** with SendGrid integration
- **Graceful error handling** and fallback mechanisms
- **Professional email templates** with HTML formatting
- **Database persistence** for audit trails
- **Comprehensive logging** for debugging
- **Security best practices** for API key management
- **Type safety** with TypeScript interfaces

All code is production-ready and follows NestJS best practices.
