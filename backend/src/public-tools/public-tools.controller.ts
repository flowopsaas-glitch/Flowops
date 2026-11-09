import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PublicToolsService, type EstimateLineDto } from './public-tools.service';

/**
 * Public freight tools — unauthenticated, rate-limited.
 *
 * `@Public()` is what keeps these off the tenant auth path: a prospect must
 * be able to use them without an account, which is the entire point.
 *
 * They are throttled because they are free, public and cost CPU, and because
 * an unauthenticated endpoint that does arithmetic is worth abusing.
 */
@Controller('public/tools')
@Public()
export class PublicToolsController {
  constructor(private readonly tools: PublicToolsService) {}

  /** VAT rate, upliftment and the disclaimer, so the UI labels itself from the server. */
  @Get('rates')
  rates() {
    return this.tools.rates();
  }

  /** Search the HS reference set. `?q=laptop` or `?q=8517`. */
  @Get('hs-codes')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  searchHsCodes(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.tools.search(q ?? '', limit ? Number(limit) : undefined);
  }

  /** Estimate duty, VAT and total payable for one or more lines. */
  @Post('import-duty')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  estimate(@Body() body: { lines: EstimateLineDto[] }) {
    return this.tools.estimate(body?.lines ?? []);
  }
}
