import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SeederService } from './seeder.service';
import { SeederController } from './seeder.controller';

@Module({
  imports: [PrismaModule],
  providers: [SeederService],
  controllers: [SeederController],
  exports: [SeederService],
})
export class SeederModule {}
