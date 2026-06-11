import { Module } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { PrismaModule } from '../prisma/prisma.module'; // import PrismaModule

@Module({
  imports: [PrismaModule], // ensures PrismaService is available
  providers: [CollectionsService],
  controllers: [CollectionsController],
  exports: [CollectionsService],
})
export class CollectionsModule {}
