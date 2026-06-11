import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class CompanyService {
  private prisma = new PrismaClient();

  createCompany(name: string) {
    return this.prisma.company.create({ data: { name } });
  }

  getAll() {
    return this.prisma.company.findMany();
  }

  findById(id: string) {
    return this.prisma.company.findUnique({ where: { id } });
  }
}
