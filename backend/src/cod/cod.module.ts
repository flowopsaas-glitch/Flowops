import { Module } from '@nestjs/common';
import { CodService } from './cod.service';
import { CodController } from './cod.controller';

@Module({
  controllers: [CodController],
  providers: [CodService],
  exports: [CodService],
})
export class CodModule {}
