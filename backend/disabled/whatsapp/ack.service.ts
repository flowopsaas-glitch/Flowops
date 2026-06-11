import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AckService {
  constructor(private readonly prisma: PrismaService) {}

  async acknowledgeCollectionByWhatsapp(collectionId: number): Promise<{ success: boolean; collectionId: number }> {
    // Example: update collection status
    await this.prisma.collection.update({
      where: { id: collectionId },
      data: { status: 'ACKNOWLEDGED' },
    });
    return { success: true, collectionId };
  }
}
