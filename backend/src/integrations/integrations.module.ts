import { Global, Module } from '@nestjs/common';
import { IntegrationCryptoService } from './integration-crypto.service';
import { IntegrationCredentialService } from './integration-credential.service';
import { IntegrationCredentialController } from './integration-credential.controller';

/**
 * Per-tenant integration credential store (WhatsApp, Shopify, WooCommerce).
 * Global so the WhatsApp + e-commerce services can read decrypted credentials
 * without import wiring. PrismaModule + BillingModule are themselves global.
 */
@Global()
@Module({
  controllers: [IntegrationCredentialController],
  providers: [IntegrationCryptoService, IntegrationCredentialService],
  exports: [IntegrationCredentialService, IntegrationCryptoService],
})
export class IntegrationsModule {}
