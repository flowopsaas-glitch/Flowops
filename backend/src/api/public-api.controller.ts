import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WaybillsService } from '../waybills/waybills.service';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeyGuard } from './api-key.guard';
import { CreateWaybillDto } from '../waybills/dto/waybill.dto';

/**
 * Public REST API for tenant integrations (e.g. a Shopify app creating waybills
 * on order fulfilment). Authenticated by API key, not JWT.
 *
 * Auth: send `X-API-Key: fok_live_…`
 */
@ApiTags('Public API')
@Public() // bypass the global JWT guard…
@UseGuards(ApiKeyGuard) // …and authenticate by API key instead
@Controller('public/v1')
export class PublicApiController {
  constructor(private readonly waybills: WaybillsService) {}

  /** Create a waybill (e.g. from a Shopify order). */
  @Post('waybills')
  createWaybill(@Req() req: any, @Body() body: CreateWaybillDto) {
    return this.waybills.create(req.apiCompanyId, body);
  }

  /** List recent waybills for the authenticated tenant. */
  @Get('waybills')
  listWaybills(@Req() req: any) {
    return this.waybills.findRecent(req.apiCompanyId);
  }

  /** Fetch a single waybill by id. */
  @Get('waybills/:id')
  getWaybill(@Req() req: any, @Param('id') id: string) {
    return this.waybills.findOne(id, req.apiCompanyId);
  }
}
