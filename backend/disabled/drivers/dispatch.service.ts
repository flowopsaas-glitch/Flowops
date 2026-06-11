import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionStatus, DriverStatus, QuoteStatus } from '../common/enums';


@Injectable()
export class DispatchService {
  constructor(private readonly prisma: PrismaService) {}

  updateStatus(collectionId: string, status: CollectionStatus) {
    return this.prisma.collection.update({
      where: { id: collectionId },
      data: { status },
    });
  }
}
