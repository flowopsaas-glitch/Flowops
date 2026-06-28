import { Injectable } from '@nestjs/common';
import { CustomsEdiTransport } from './customs-edi-transport';
import { NullCustomsEdiTransport } from './transports/null.transport';
import { ClearingAgentHandoffTransport } from './transports/clearing-agent-handoff.transport';
import { ServiceProviderEdiTransport } from './transports/service-provider.transport';
import { DirectSarsEdiTransport } from './transports/direct-sars-edi.transport';

/**
 * Resolves a tenant's configured CustomsEdiPath to the matching transport. The
 * declaration workflow calls this and never branches on provider type itself —
 * adding a new provider means adding a transport + a case here.
 */
@Injectable()
export class CustomsEdiTransportFactory {
  constructor(
    private readonly nullTransport: NullCustomsEdiTransport,
    private readonly handoff: ClearingAgentHandoffTransport,
    private readonly serviceProvider: ServiceProviderEdiTransport,
    private readonly directEdi: DirectSarsEdiTransport,
  ) {}

  forPath(path?: string | null): CustomsEdiTransport {
    switch (path) {
      case 'CLEARING_AGENT_HANDOFF':
        return this.handoff;
      case 'SERVICE_PROVIDER':
        return this.serviceProvider;
      case 'DIRECT_EDI':
        return this.directEdi;
      default:
        return this.nullTransport;
    }
  }
}
