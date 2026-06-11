import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Company } from '@prisma/client';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async createCompany(name: string): Promise<Company> {
    return (this.prisma as any).company.create({ data: { name } });
  }

  async getCompanies(): Promise<Company[]> {
    return (this.prisma as any).company.findMany();
  }
}