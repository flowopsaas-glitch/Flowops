import { Module } from '@nestjs/common';
import { CashService } from './cash.service';
import { CashController } from './cash.controller';

@Module({
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService], // 👈 THIS IS CRITICAL
})
export class CashModule {}
