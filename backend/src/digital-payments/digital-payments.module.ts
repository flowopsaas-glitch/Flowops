import { Module } from '@nestjs/common';
import { DigitalPaymentsController } from './digital-payments.controller';
import { DigitalPaymentsService } from './digital-payments.service';

@Module({
  controllers: [DigitalPaymentsController],
  providers: [DigitalPaymentsService],
  exports: [DigitalPaymentsService],
})
export class DigitalPaymentsModule {}
