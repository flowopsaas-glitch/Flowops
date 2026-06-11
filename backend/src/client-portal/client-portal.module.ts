import { Module } from '@nestjs/common';
import { ClientPortalService } from './client-portal.service';
import { ClientPortalController } from './client-portal.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ClientPortalService],
  controllers: [ClientPortalController],
  exports: [ClientPortalService]
})
export class ClientPortalModule {}
