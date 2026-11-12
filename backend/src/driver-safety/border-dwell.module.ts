import { Module } from '@nestjs/common';
import { BorderDwellService } from './border-dwell.service';
import { BorderDwellController } from './border-dwell.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BorderDwellController],
  providers: [BorderDwellService],
  exports: [BorderDwellService],
})
export class BorderDwellModule {}
