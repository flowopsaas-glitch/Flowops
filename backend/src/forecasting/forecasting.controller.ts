import { Controller, Get } from '@nestjs/common';
import { ForecastingService } from './forecasting.service';
import { CashService } from '../cash/cash.service';

@Controller('forecasting')
export class ForecastingController {
  constructor(
    private readonly forecastingService: ForecastingService,
    private readonly cashService: CashService,
  ) {}

  @Get()
  async getForecast() {
    const cash = this.cashService.getCashPosition();
    return this.forecastingService.generateForecast(cash);
  }
}
