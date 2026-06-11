// File: src/booking-portal/booking-portal.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { BookingPortalService } from './booking-portal.service';
import { CreateBookingRequestDto } from './dto/create-booking-request.dto';
import { CreatePortalLinkDto } from './dto/create-portal-link.dto';

@Controller('booking-portal')
export class BookingPortalController {
  constructor(private readonly bookingPortalService: BookingPortalService) {}

  // -------------------------
  // Internal // Admin Endpoints
  // -------------------------

  /** Create a portal link for a tenant company */
  @Post('companies/:companyId/links')
  createPortalLink(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreatePortalLinkDto,
  ) {
    return this.bookingPortalService.createPortalLink(companyId, dto);
  }

  /** List all portal links for a tenant company */
  @Get('companies/:companyId/links')
  getCompanyPortalLinks(
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.bookingPortalService.getPortalLinksForCompany(companyId);
  }

  /** List all booking requests for a tenant company */
  @Get('companies/:companyId/requests')
  getCompanyRequests(
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.bookingPortalService.listCompanyBookingRequests(companyId);
  }

  /** List all booking requests for a specific client within a tenant company */
  @Get('companies/:companyId/clients/:clientId/requests')
  getClientRequests(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('clientId', ParseIntPipe) clientId: number,
  ) {
    return this.bookingPortalService.listClientBookingRequests(companyId, clientId);
  }

  // -------------------------
  // Public Portal Endpoints
  // -------------------------

  /** Fetch portal info by public token */
  @Get('public/:token')
  getPortalByToken(@Param('token') token: string) {
    return this.bookingPortalService.getPortalByToken(token);
  }

  /** Create a public booking request via portal token */
  @Post('public/:token/requests')
  createPublicBookingRequest(
    @Param('token') token: string,
    @Body() dto: CreateBookingRequestDto,
  ) {
    return this.bookingPortalService.createPublicBookingRequest(token, dto);
  }
}
