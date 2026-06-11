import { Controller, Get } from '@nestjs/common';

@Controller('v2') // Path: /api/v2/...
export class V2BridgeController {

  @Get('clients') // Fixes Clients.tsx:15 404
  getClients() {
    return [
      { id: 'PER-1777464090105', name: 'Global Logistics Corp', status: 'FINALIZED' },
      { id: 'PER-1777645121470', name: 'Standard Freight Ltd', status: 'DRAFT' }
    ];
  }

  @Get('rate-cards') // Fixes RateCards.tsx:65 404
  getRateCards() {
    return [
      { id: 1, carrier: 'DHL', zone: 'International', rate: 'Market' },
      { id: 2, carrier: 'UPS', zone: 'Domestic', rate: 'Preferred' }
    ];
  }
}
