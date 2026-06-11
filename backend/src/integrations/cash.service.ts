import { Injectable } from '@nestjs/common';

@Injectable()
export class CashService {
  getPosition() {
    return {
      availableCash: 1250000,
      currency: 'USD',
      updatedAt: new Date().toISOString(),
    };
  }
}
