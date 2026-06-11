import { Module, Global } from '@nestjs/common';
import { CloudStorageService } from '../services/cloud-storage.service';
import { PrismaService } from '../prisma/prisma.service';

@Global()
@Module({
  providers: [CloudStorageService, PrismaService],
  exports: [CloudStorageService, PrismaService],
})
export class InfraModule {}

