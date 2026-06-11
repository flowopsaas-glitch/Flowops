import { Module } from '@nestjs/common';
import { AISecurityController } from './ai-security.controller';
import { AISecurityService } from './ai-security.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AISecurityController],
  providers: [AISecurityService],
  exports: [AISecurityService],
})
export class AISecurityModule {}
