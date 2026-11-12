import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { QuotesService } from './quotes.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CreateQuoteDto } from './dto/create-quote.dto';
const QUOTE_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.VIEWER,
];


@ApiTags('Quotes')
@ApiBearerAuth()
@Roles(...QUOTE_READ_ROLES)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly svc: QuotesService) {}

  @Get()
  findAll(@CurrentUser() u: any) {
    return this.svc.findAll(u.companyId);
  }

  @Get('metrics')
  metrics(@CurrentUser() u: any) {
    return this.svc.metrics(u.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post()
  create(@CurrentUser() u: any, @Body() dto: CreateQuoteDto) {
    return this.svc.create(u.companyId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Patch(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.accept(id, u.companyId);
  }
}
