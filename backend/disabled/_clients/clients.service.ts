import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async createClient(data: {
    companyName: string;
    contactEmail: string;
    contactPhone: string;
    whatsapp?: string;
  }) {
    return this.prisma.client.create({
      data: {
        ...data,
        subscription: {
          create: {
            startDate: new Date(),
            features: {
              create: {},
            },
          },
        },
      },
      include: {
        subscription: {
          include: { features: true },
        },
      },
    });
  }

  async getClientFeatures(clientId: string) {
    return this.prisma.featureFlags.findFirst({
      where: { subscription: { clientId } },
    });
  }
}
