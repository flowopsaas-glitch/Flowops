import { Module } from '@nestjs/common';
import { CodController } from './cod.controller';
import { CodService } from './cod.service';

@Module({
  controllers: [CodController],
  providers: [CodService],
  exports: [CodService],
})
export class CodModule {}
