// src/onboarding/onboarding.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

export interface SignupRequestDto {
  companyName: string;
  contactEmail: string;
  contactName: string;
  contactPhone?: string;
  requestedPlan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  message?: string;
}

export interface InviteLinkDto {
  email: string;
  companyName: string;
  plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  expiresInDays?: number;
}

export interface SignupRequest {
  id: number;
  companyName: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string | null;
  requestedPlan: string;
  message: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  aiTriage: string | null;
  aiPriority: string | null;
  inviteToken: string | null;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  generatedEmail: string | null;
  generatedCompanyId: number | null;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger('OnboardingService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /**
   * PUBLIC: Submit a signup request (from public signup page)
   */
  async submitSignupRequest(dto: SignupRequestDto): Promise<SignupRequest> {
    if (!dto.companyName?.trim() || !dto.contactEmail?.trim() || !dto.contactName?.trim()) {
      throw new BadRequestException('Company name, contact email, and contact name are required');
    }

    // Check for duplicate pending requests
    const existing = await this.prisma.signupRequest.findFirst({
      where: { contactEmail: dto.contactEmail.toLowerCase(), status: 'PENDING' },
    });
    if (existing) {
      throw new BadRequestException('A signup request with this email is already pending review');
    }

    // AI Triage: categorize the request based on plan and content
    const aiTriage = this.performAITriage(dto);

    const request = await this.prisma.signupRequest.create({
      data: {
        companyName: dto.companyName.trim(),
        contactEmail: dto.contactEmail.toLowerCase().trim(),
        contactName: dto.contactName.trim(),
        contactPhone: dto.contactPhone?.trim() || null,
        requestedPlan: dto.requestedPlan || 'STARTER',
        message: dto.message?.trim() || null,
        status: 'PENDING',
        aiTriage: aiTriage.summary,
        aiPriority: aiTriage.priority,
      },
    });

    this.logger.log(`📥 New signup request: "${dto.companyName}" (${dto.contactEmail}) → Plan: ${dto.requestedPlan} | AI Priority: ${aiTriage.priority}`);

    // Send notification to super admin
    try {
      await this.mailService.safeSendInternal({
        subject: `🆕 New Signup Request: ${dto.companyName} (${dto.requestedPlan})`,
        html: `
          <h2>New FlowOps Signup Request</h2>
          <p><strong>Company:</strong> ${dto.companyName}</p>
          <p><strong>Contact:</strong> ${dto.contactName} (${dto.contactEmail})</p>
          <p><strong>Phone:</strong> ${dto.contactPhone || 'Not provided'}</p>
          <p><strong>Requested Plan:</strong> ${dto.requestedPlan}</p>
          <p><strong>Message:</strong> ${dto.message || 'None'}</p>
          <hr/>
          <p><strong>AI Triage:</strong> ${aiTriage.summary}</p>
          <p><strong>AI Priority:</strong> ${aiTriage.priority}</p>
          <p><em>Login to your SuperAdmin dashboard to approve or reject this request.</em></p>
        `,
      });
    } catch (e) {
      this.logger.warn('Failed to send admin notification email');
    }

    return request;
  }

  /**
   * SUPER_ADMIN: List all signup requests
   */
  async listRequests(status?: string): Promise<SignupRequest[]> {
    const where = status ? { status: status as any } : {};
    return this.prisma.signupRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * SUPER_ADMIN: Get request stats
   */
  async getStats() {
    const [total, pending, approved, rejected] = await Promise.all([
      this.prisma.signupRequest.count(),
      this.prisma.signupRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.signupRequest.count({ where: { status: 'APPROVED' } }),
      this.prisma.signupRequest.count({ where: { status: 'REJECTED' } }),
    ]);
    return { total, pending, approved, rejected };
  }

  /**
   * SUPER_ADMIN: Approve a signup request → auto-create company + user + send credentials
   */
  async approveRequest(requestId: number): Promise<{ company: any; user: any; generatedPassword: string }> {
    const request = await this.prisma.signupRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Signup request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Request is already processed');

    // 1. Generate secure password
    const generatedPassword = this.generateSecurePassword(request.requestedPlan);

    // 2. Create the company
    const company = await this.prisma.company.create({
      data: {
        name: request.companyName,
        status: 'Active',
        plan: request.requestedPlan as any,
        isActive: true,
        baseTierPrice: this.getPlanPrice(request.requestedPlan),
        perUserPrice: 500,
        pricePerWhatsapp: 0.80,
        pricePerEmail: 0.10,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
      },
    });

    // 3. Create the admin user
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);
    const user = await this.prisma.user.create({
      data: {
        email: request.contactEmail,
        password: hashedPassword,
        name: request.contactName,
        role: 'ADMIN',
        companyId: company.id,
        isVerified: true,
      },
    });

    // 4. Update the signup request
    await this.prisma.signupRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        generatedEmail: request.contactEmail,
        generatedCompanyId: company.id,
      },
    });

    // 5. Send welcome email with credentials
    try {
      await this.mailService.safeSendInternal({
        to: request.contactEmail,
        subject: `🎉 Welcome to FlowOps — Your ${request.requestedPlan} Account is Ready!`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #6C9EFF;">Welcome to FlowOps!</h1>
            <p>Hi ${request.contactName},</p>
            <p>Your <strong>${request.requestedPlan}</strong> account for <strong>${request.companyName}</strong> has been approved and is ready to use.</p>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Your Login Credentials</h3>
              <p><strong>Email:</strong> ${request.contactEmail}</p>
              <p><strong>Password:</strong> <code style="background: #1e293b; color: #4ade80; padding: 4px 8px; border-radius: 4px;">${generatedPassword}</code></p>
              <p style="font-size: 12px; color: #64748b;">⚠️ Please change your password after first login.</p>
            </div>
            
            <p><strong>Plan Features (${request.requestedPlan}):</strong></p>
            <ul>
              ${this.getPlanFeatures(request.requestedPlan).map(f => `<li>${f}</li>`).join('')}
            </ul>
            
            <p>Login at: <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login">FlowOps Platform</a></p>
            
            <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
              Your 14-day free trial starts today. Need help? Reply to this email.
            </p>
          </div>
        `,
      });
      this.logger.log(`📧 Welcome email sent to ${request.contactEmail}`);
    } catch (e) {
      this.logger.warn(`Failed to send welcome email to ${request.contactEmail}: ${e.message}`);
    }

    this.logger.log(`✅ Approved signup: "${request.companyName}" → Company ID: ${company.id}, User: ${user.email}`);

    return { company, user, generatedPassword };
  }

  /**
   * SUPER_ADMIN: Reject a signup request
   */
  async rejectRequest(requestId: number, reason?: string) {
    const request = await this.prisma.signupRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Signup request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Request is already processed');

    await this.prisma.signupRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' },
    });

    // Optionally notify the requester
    try {
      await this.mailService.safeSendInternal({
        to: request.contactEmail,
        subject: 'FlowOps — Signup Request Update',
        html: `
          <p>Hi ${request.contactName},</p>
          <p>Thank you for your interest in FlowOps. Unfortunately, your signup request for "${request.companyName}" could not be approved at this time.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>Feel free to reach out if you have any questions.</p>
        `,
      });
    } catch (e) { /* ignore */ }

    return { message: 'Request rejected' };
  }

  /**
   * SUPER_ADMIN: Generate an invite link for a specific plan
   */
  async generateInviteLink(dto: InviteLinkDto) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + (dto.expiresInDays || 7) * 24 * 60 * 60 * 1000);

    await this.prisma.signupRequest.create({
      data: {
        companyName: dto.companyName,
        contactEmail: dto.email,
        contactName: dto.email.split('@')[0],
        requestedPlan: dto.plan,
        status: 'PENDING',
        inviteToken: token,
        aiTriage: 'Invite link generated by Super Admin',
        aiPriority: 'HIGH',
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const signupUrl = `${frontendUrl}/signup?invite=${token}&plan=${dto.plan}&email=${encodeURIComponent(dto.email)}`;

    // Send invite email
    try {
      await this.mailService.safeSendInternal({
        to: dto.email,
        subject: `You're Invited to FlowOps — ${dto.plan} Plan`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #6C9EFF;">You're Invited to FlowOps!</h1>
            <p>You've been invited to join FlowOps on the <strong>${dto.plan}</strong> plan for <strong>${dto.companyName}</strong>.</p>
            <a href="${signupUrl}" style="display: inline-block; background: linear-gradient(135deg, #6C9EFF, #A78BFA); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0;">
              Complete Your Signup
            </a>
            <p style="color: #64748b; font-size: 12px;">This link expires in ${dto.expiresInDays || 7} days.</p>
          </div>
        `,
      });
    } catch (e) {
      this.logger.warn(`Failed to send invite email: ${e.message}`);
    }

    return { signupUrl, token, expiresAt };
  }

  // ─── AI TRIAGE ────────────────────────────────────────────────────────────
  private performAITriage(dto: SignupRequestDto): { summary: string; priority: string } {
    const plan = dto.requestedPlan;
    let priority = 'MEDIUM';
    let summary = '';

    if (plan === 'ENTERPRISE') {
      priority = 'HIGH';
      summary = `Enterprise prospect from "${dto.companyName}". High-value lead — prioritize approval.`;
    } else if (plan === 'PROFESSIONAL') {
      priority = 'MEDIUM';
      summary = `Pro-tier signup from "${dto.companyName}". Standard onboarding flow.`;
    } else {
      priority = 'LOW';
      summary = `Starter plan request from "${dto.companyName}". Consider auto-approval for free tier.`;
    }

    if (dto.message && dto.message.toLowerCase().includes('urgent')) {
      priority = 'HIGH';
      summary += ' (Marked as urgent by requester)';
    }

    return { summary, priority };
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  private generateSecurePassword(plan: string): string {
    const prefix = plan === 'ENTERPRISE' ? 'Ent' : plan === 'PROFESSIONAL' ? 'Pro' : 'Start';
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}${random}!${new Date().getFullYear()}`;
  }

  private getPlanPrice(plan: string): number {
    switch (plan) {
      case 'ENTERPRISE': return 7500;
      case 'PROFESSIONAL': return 3500;
      default: return 0; // Starter is free trial
    }
  }

  private getPlanFeatures(plan: string): string[] {
    switch (plan) {
      case 'ENTERPRISE':
        return ['Unlimited users', 'AI-powered ops autopilot', 'WhatsApp integration', 'Priority support', 'Custom billing', 'SLA monitoring'];
      case 'PROFESSIONAL':
        return ['Up to 25 users', 'Advanced analytics', 'Email hub', 'Rate cards', 'Dispatch management'];
      default:
        return ['Up to 5 users', 'Basic waybill management', 'Dashboard', 'Collections tracking'];
    }
  }
}
