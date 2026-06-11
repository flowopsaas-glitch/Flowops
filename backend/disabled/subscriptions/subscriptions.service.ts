import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  async create(): Promise<void> {
    this.logger.log('SubscriptionsService.create skipped (schema not implemented)');
  }

  async cancel(): Promise<void> {
    this.logger.log('SubscriptionsService.cancel skipped (schema not implemented)');
  }

  async findByOrganisation(): Promise<any[]> {
    this.logger.log('SubscriptionsService.findByOrganisation skipped (schema not implemented)');
    return [];
  }
}
