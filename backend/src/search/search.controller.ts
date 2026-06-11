import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { AppAuthGuard } from '../auth/app-auth.guard';

/**
 * 🔍 SEARCH ENDPOINTS - Ghost Search API
 * Premium full-text and advanced search for waybills
 */
@Controller('search')
@UseGuards(AppAuthGuard)
export class SearchController {
  constructor(private readonly searchService: ElasticsearchService) {}

  /**
   * GET /search?q=query&dateFrom=...&zone=...
   * Basic search with filters
   */
  @Get()
  async searchWaybills(
    @Request() req: any,
    @Query('q') query: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('zone') zone?: string,
    @Query('status') status?: string,
    @Query('weightMin', new ParseIntPipe({ optional: true })) weightMin?: number,
    @Query('weightMax', new ParseIntPipe({ optional: true })) weightMax?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize: number = 20,
  ) {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return { success: false, reason: 'Authentication required' };
    }

    // Check if company has premium search enabled
    const company = req.user?.company;
    if (!company?.enabledFeatures?.includes('ghost-search')) {
      return {
        success: false,
        reason: 'Ghost Search not enabled for your tier',
      };
    }

    const result = await this.searchService.searchWaybills(companyId, {
      text: query,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      zone,
      status,
      weightMin,
      weightMax,
    }, page, pageSize);

    // Broadcast results to WebSocket clients
    this.searchService.broadcastSearchResults(companyId, query, result.results);

    return {
      success: true,
      data: result,
    };
  }

  /**
   * POST /search/advanced
   * Natural language search
   *
   * Body: { query: "Find all waybills from Zone 5 over 50kg last 90 days" }
   */
  @Post('advanced')
  async advancedSearch(
    @Request() req: any,
    @Body() body: { query: string },
  ) {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return { success: false, reason: 'Authentication required' };
    }

    const company = req.user?.company;
    if (!company?.enabledFeatures?.includes('ghost-search')) {
      return {
        success: false,
        reason: 'Ghost Search not enabled for your tier',
      };
    }

    const results = await this.searchService.advancedSearch(companyId, body.query);

    this.searchService.broadcastSearchResults(companyId, body.query, results.results);

    return {
      success: true,
      data: results,
    };
  }

  /**
   * GET /search/facets
   * Get search filter options for UI
   */
  @Get('facets')
  async getFacets(@Request() req: any) {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return { success: false, reason: 'Authentication required' };
    }

    const facets = await this.searchService.getSearchFacets(companyId);

    return {
      success: true,
      data: facets,
    };
  }
}
