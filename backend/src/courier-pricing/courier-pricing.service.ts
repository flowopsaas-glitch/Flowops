import { Injectable } from '@nestjs/common';

@Injectable()
export class CourierPricingService {
  async create() {
    return { message: 'Courier pricing not implemented yet' };
  }

  async findAll() {
    return [];
  }

  async clear() {
    return { deleted: 0 };
  }
}
