// src/user/user.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    return (this.prisma as any).user.findUnique({
      where: { id },
    });
  }

  async findAll() {
    return (this.prisma as any).user.findMany({
      orderBy: { id: 'asc' },
    });
  }
}