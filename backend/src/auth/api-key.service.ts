import { Injectable } from '@nestjs/common';

export interface Tenant {
  id: string;
  name: string;
  apiKey: string;
}

@Injectable()
export class ApiKeyService {
  private tenants: Tenant[] = [
    {
      id: 'tenant_acme',
      name: 'Acme Corp',
      apiKey: 'FLOWOPS_ACME_KEY',
    },
    {
      id: 'tenant_beta',
      name: 'Beta Industries',
      apiKey: 'FLOWOPS_BETA_KEY',
    },
  ];

  findByApiKey(apiKey: string): Tenant | undefined {
    return this.tenants.find(t => t.apiKey === apiKey);
  }
}
