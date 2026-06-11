import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CourierBootstrapService {
  private readonly logger = new Logger(CourierBootstrapService.name);

  async bootstrap(): Promise<void> {
    // Courier users are not implemented yet
    this.logger.log('Courier bootstrap skipped (not implemented)');
  }
}
