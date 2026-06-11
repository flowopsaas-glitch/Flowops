import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Simple in-memory store for typing indicators
const typingStatus = new Map<number, { isTyping: boolean; timestamp: number }>();

@Injectable()
export class DriverChatService {
  constructor(private prisma: PrismaService) {}

  async getMessages(driverId: number, limit: number = 50, skip: number = 0) {
    return this.prisma.dispatchMessage.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
    });
  }

  async sendMessage(driverId: number, senderId: number, senderType: string, message: string, type: string = 'text', attachmentUrl?: string, attachmentType?: string) {
    return this.prisma.dispatchMessage.create({
      data: { driverId, senderId, senderType, message, type, attachmentUrl, attachmentType },
    });
  }

  async markAsRead(driverId: number, readerType: 'driver' | 'dispatch') {
    // Mark messages as read if they were sent by the OTHER party
    const senderToMark = readerType === 'driver' ? 'dispatch' : 'driver';
    return this.prisma.dispatchMessage.updateMany({
      where: { driverId, senderType: senderToMark, readAt: null },
      data: { readAt: new Date() },
    });
  }

  setTyping(driverId: number, isTyping: boolean) {
    typingStatus.set(driverId, { isTyping, timestamp: Date.now() });
  }

  getTypingStatus(driverId: number) {
    const status = typingStatus.get(driverId);
    if (!status) return false;
    // Auto-clear typing status after 3 seconds
    if (Date.now() - status.timestamp > 3000) {
      typingStatus.delete(driverId);
      return false;
    }
    return status.isTyping;
  }
}
