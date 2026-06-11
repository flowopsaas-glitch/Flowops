import { Controller, Get } from '@nestjs/common';
import { CashService } from './cash.service';

@Controller('cash')
export class CashController {
  constructor(private readonly service: CashService) {}

  @Get('position')
  getCashPosition() {
    return this.service.getPosition();
  }
}
