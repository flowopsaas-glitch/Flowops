import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AISecurityService {
  private readonly COST_PER_MESSAGE: number;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService
  ) {
    this.COST_PER_MESSAGE = parseFloat(this.config.get('AI_MESSAGE_COST', '0.50')); // R0.50 per message
  }

  // Validate security code
  async validateSecurityCode(companyId: number, code: string) {
    const securityCode = await this.prisma.securityCode.findUnique({
      where: { code },
    });

    if (!securityCode) {
      throw new UnauthorizedException('Invalid security code');
    }

    if (securityCode.companyId !== companyId) {
      throw new UnauthorizedException('Security code not valid for this company');
    }

    if (!securityCode.isActive) {
      throw new UnauthorizedException('Security code is no longer active');
    }

    if (securityCode.expiresAt && new Date() > securityCode.expiresAt) {
      throw new UnauthorizedException('Security code has expired');
    }

    if (securityCode.maxUses && securityCode.usedCount >= securityCode.maxUses) {
      throw new UnauthorizedException('Security code has reached maximum usage');
    }

    // Increment usage count
    await this.prisma.securityCode.update({
      where: { id: securityCode.id },
      data: { usedCount: { increment: 1 } },
    });

    return securityCode;
  }

  // Create or get AI session
  async getOrCreateSession(
    companyId: number,
    securityCodeId: number,
    clientEmail?: string
  ) {
    // Check for existing active session
    let session = await this.prisma.aISession.findFirst({
      where: {
        companyId,
        securityCodeId,
        status: 'ACTIVE',
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    if (!session) {
      // Create new session
      session = await this.prisma.aISession.create({
        data: {
          companyId,
          securityCodeId,
          clientEmail,
          status: 'ACTIVE',
        },
      });
    }

    return session;
  }

  // Log AI message and calculate cost
  async logMessage(
    sessionId: number,
    role: 'USER' | 'ASSISTANT' | 'SYSTEM',
    content: string,
    tokensUsed: number = 0
  ) {
    // Calculate cost (only charge for user messages)
    const cost = role === 'USER' ? this.COST_PER_MESSAGE : 0;

    const message = await this.prisma.aIMessage.create({
      data: {
        sessionId,
        role,
        content,
        tokensUsed,
        cost,
        billedToClient: role === 'USER',
      },
    });

    // Update session stats
    await this.prisma.aISession.update({
      where: { id: sessionId },
      data: {
        messageCount: { increment: 1 },
        totalCost: { increment: cost },
        lastActivityAt: new Date(),
      },
    });

    return message;
  }

  // Create bill for client
  async createBill(sessionId: number) {
    const session = await this.prisma.aISession.findUnique({
      where: { id: sessionId },
      include: { messages: true },
    });

    if (!session || !session.clientEmail) {
      throw new BadRequestException('Session not found or no client email');
    }

    // Count billable messages (user messages only)
    const userMessages = session.messages.filter(m => m.role === 'USER');
    const totalCost = userMessages.reduce((sum, m) => sum + m.cost, 0);

    if (userMessages.length === 0) {
      return null; // No billable messages
    }

    const bill = await this.prisma.aIMessageBill.create({
      data: {
        companyId: session.companyId,
        sessionId: session.id,
        messageId: userMessages[userMessages.length - 1].id,
        clientEmail: session.clientEmail,
        messageCount: userMessages.length,
        costPerMessage: this.COST_PER_MESSAGE,
        totalCost,
        currency: 'ZAR',
        status: 'PENDING',
      },
    });

    return bill;
  }

  // Get session stats
  async getSessionStats(sessionId: number) {
    const session = await this.prisma.aISession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    return {
      sessionId: session.id,
      status: session.status,
      messageCount: session.messageCount,
      totalCost: session.totalCost,
      currency: 'ZAR',
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      messages: session.messages.map(m => ({
        role: m.role,
        content: m.content,
        cost: m.cost,
        createdAt: m.createdAt,
      })),
    };
  }
}
