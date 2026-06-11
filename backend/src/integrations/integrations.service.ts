import { Injectable } from '@nestjs/common';

@Injectable()
export class IntegrationsService {
  private integrations: any[] = [];

  connect(type: string, config: any) {
    const integration = {
      id: Date.now(),
      type,
      status: 'connected',
      config,
      connectedAt: new Date().toISOString(),
    };

    this.integrations.push(integration);
    return integration;
  }

  list() {
    return this.integrations;
  }
}
