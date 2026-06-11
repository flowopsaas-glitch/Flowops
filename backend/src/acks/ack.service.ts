import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class AckService {
  constructor(private prisma: PrismaService) {}
  async create(dto: any) { return (this.prisma as any).acknowledgement.create({ data: dto }); }
  async findAll() { return (this.prisma as any).acknowledgement.findMany(); }
  async listForCollection(id: number) { return []; }
  async acknowledge(u: any, c: any) { return { success: true }; }
}