import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TripDocumentService } from './trip-document.service';
import { CreateTripDocumentDto } from './dto/incident-document.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

const DOC_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.WAREHOUSE,
];

@ApiTags('Trip Documents')
@ApiBearerAuth()
@Controller('trip-documents')
export class TripDocumentController {
  constructor(private readonly svc: TripDocumentService) {}

  @Roles(...DOC_ROLES)
  @Get()
  @ApiOperation({ summary: 'Document packs for this tenant, newest first' })
  list(@CurrentUser() u: any, @Query('tripId') tripId?: string) {
    return this.svc.list(u.companyId, tripId);
  }

  @Roles(...DOC_ROLES)
  @Post()
  @ApiOperation({ summary: 'Record a document against a trip' })
  create(@CurrentUser() u: any, @Body() dto: CreateTripDocumentDto) {
    return this.svc.create(u.companyId, dto, u);
  }
}
