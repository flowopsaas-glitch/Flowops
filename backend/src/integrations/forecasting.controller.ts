import { Controller, Get } from '@nestjs/common';
import { ForecastingService } from './forecasting.service';

@Controller('forecasting')
export class ForecastingController {
  constructor(private readonly service: ForecastingService) {}

  @Get('cash')
  forecastCash() {
    return this.service.forecast();
  }
}
