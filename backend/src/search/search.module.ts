import { Module } from '@nestjs/common';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { AuthModule } from '../auth/auth.module';
import { ElasticsearchService } from './elasticsearch.service';
import { SearchController } from './search.controller';

/**
 * SEARCH MODULE - Premium Ghost Search
 *
 * Full-text search for waybills powered by Elasticsearch
 * Features:
 * - Full-text indexing (recipient, address, driver, waybill#)
 * - Faceted search (date, weight, zone, status)
 * - Natural language query parsing
 * - Real-time WebSocket result streaming
 * - GDPR compliance (right-to-forget)
 *
 * Feature Gate: ENTERPRISE tier only
 * if (company.enabledFeatures?.includes('ghost-search')) { ... }
 */
@Module({
  imports: [BroadcastModule, AuthModule],
  providers: [ElasticsearchService],
  controllers: [SearchController],
  exports: [ElasticsearchService],
})
export class SearchModule {}
