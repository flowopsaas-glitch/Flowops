import { Injectable, Logger } from '@nestjs/common';
import { SlaService } from './sla.service';

@Injectable()
export class SlaScheduler {
  private readonly logger = new Logger(SlaScheduler.name);

  constructor(private readonly slaService: SlaService) {}

  // Example: manual trigger for SLA checks (can be called by other modules or endpoints)
  async runSlaCheck() {
    this.logger.log('Manual SLA check triggered');
    await this.slaService.checkSla();
  }
}