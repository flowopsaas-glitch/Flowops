import { Controller, Get } from '@nestjs/common';

@Controller('drivers')
export class DriversController {
  @Get()
  async getDrivers() {
    console.log('🛰️ Drivers endpoint hit - returning mocks');
    return [
      { id: 'D1', name: 'Kadi Dev', status: 'Available' },
      { id: 'D2', name: 'Fleet Unit 01', status: 'On Route' }
    ];
  }
}
