import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  // Method your scheduler calls
  async checkSla() {
    this.logger.log('Running SLA check...');
    // TODO: implement SLA logic here, e.g., check pending collections, send alerts, etc.
  }

  // Cron job delegates to checkSla()
  @Cron(CronExpression.EVERY_MINUTE)
  handleSlaCheck() {
    this.checkSla(); // call the method
  }

  // Optional: additional SLA helper for collections
  async calculateSlaForCollection(collectionId: number) {
    this.logger.log(`Calculating SLA for collection ${collectionId}`);
    // TODO: add SLA calculation logic
    return true;
  }
}